import os
import sys
from typing import Dict, List, Any
from collections import defaultdict
import boto3
from botocore.exceptions import ClientError, BotoCoreError
from netapp_ontap import config, HostConnection
from netapp_ontap.resources import SnapmirrorRelationship
from netapp_ontap.error import NetAppRestError
from aws_lambda_powertools import Logger, Tracer, Metrics, single_metric
from aws_lambda_powertools.metrics import MetricUnit
from aws_lambda_powertools.utilities import parameters
from aws_lambda_powertools.utilities.parameters.exceptions import GetParameterError
from aws_lambda_powertools.utilities.typing import LambdaContext


# Lambda Powertoolsの設定
logger = Logger()
tracer = Tracer()
metrics = Metrics()

# CloudWatch クライアントの初期化
try:
    cloudwatch = boto3.client("cloudwatch")
except (ClientError, BotoCoreError) as e:
    logger.error("Failed to initialize CloudWatch client: %s", e)
    sys.exit(1)


# FSxNへの接続
@tracer.capture_method
def get_ontap_connection() -> HostConnection:
    try:
        password = parameters.get_parameter(
            os.environ["FSXN_USER_CREDENTIAL_SSM_PARAMETER_STORE_NAME"],
            decrypt=True,
            max_age=300,
        )
        return HostConnection(
            os.environ["FSXN_DNS_NAME"],
            username=os.environ["FSXN_USER_NAME"],
            password=password,
            verify=False,
        )
    except GetParameterError as e:
        logger.error(
            "When a provider raises an exception on parameter retrieval: %s", e
        )
        raise
    except KeyError as e:
        logger.error("Missing environment variable: %s", e)
        raise
    except Exception as e:
        logger.error("Error setting up ONTAP connection: %s", e)
        raise


# SnapMirror relationshipの取得
def get_snapmirror_relationships() -> List[SnapmirrorRelationship]:
    try:
        return SnapmirrorRelationship.get_collection(fields="*")
    except NetAppRestError as error:
        logger.error("Error fetching SnapMirror relationships: %s", error)
        raise


# SnapMirror relationshipの個別のHealthをメトリクスとして整理
def process_individual_relationship_metrics(relationship: Dict[str, Any]) -> None:
    # HealthがTrueの場合は1
    # HealthがFalseの場合は0
    health_value = 1 if relationship.get("healthy", False) else 0
    with single_metric(
        name="SnapMirrorRelationshipHealth",
        unit=MetricUnit.Count,
        value=health_value,
    ) as metric:
        metric.add_dimension(
            "SourcePath", relationship.get("source", {}).get("path", "Unknown")
        )
        metric.add_dimension(
            "DestinationPath",
            relationship.get("destination", {}).get("path", "Unknown"),
        )
        metric.add_dimension("RelationshipUUID", relationship.get("uuid", "Unknown"))


# Destination SVM 単位のHealthをメトリクスとして整理
def process_svm_level_metrics(svm_health: Dict[str, Dict[str, Any]]) -> None:
    # Destination SVM 単位で、全てのSnapMirror relationshipのHealthがTrueの場合は1
    # Destination SVM 単位で、いずれかのSnapMirror relationshipのHealthがFalseの場合は0
    for svm_uuid, svm_info in svm_health.items():
        with single_metric(
            name="SnapMirrorRelationshipHealth",
            unit=MetricUnit.Count,
            value=1 if svm_info["healthy"] else 0,
        ) as metric:
            metric.add_dimension(
                "DestinationStorageVirtualMachineName", svm_info["name"]
            )
            metric.add_dimension("DestinationStorageVirtualMachineUUID", svm_uuid)


# 取得したSnapMirror relationshipの評価とレポーティング
@tracer.capture_method
def evaluate_and_report_snapmirror_health(
    relationships: List[SnapmirrorRelationship],
) -> None:
    if not relationships:
        logger.info("No SnapMirror relationships found.")
        return

    # Destination の SVM 単位の SnapMirror relationship の Health を確認するための変数を宣言
    svm_health = defaultdict(lambda: {"healthy": True, "name": "", "uuid": ""})

    for relationship in relationships:
        rel_dict = relationship.to_dict()
        logger.debug(
            "SnapMirror Relationship detected", extra={"relationship": rel_dict}
        )

        # 個別のSnapMirror relationshipのメトリクス
        process_individual_relationship_metrics(rel_dict)

        # Destination SVM単位SnapMirror relationshipの状態の評価
        update_svm_health(rel_dict, svm_health)

    # Destination SVM単位SnapMirror relationshipのメトリクス
    process_svm_level_metrics(svm_health)


# Destination SVM単位SnapMirror relationshipの状態の評価
def update_svm_health(
    rel_dict: Dict[str, Any], svm_health: Dict[str, Dict[str, Any]]
) -> None:
    destination_svm = rel_dict.get("destination", {}).get("svm", {})
    destination_svm_uuid = destination_svm.get("uuid", "Unknown")

    # SnapMirror relationshipがHealthではない場合、該当SnapMirror relationshipの詳細をログに記録
    if not rel_dict.get("healthy", False):
        svm_health[destination_svm_uuid]["healthy"] = False
        log_unhealthy_relationship(rel_dict)

    # UnhealthyなSnapMirror relationshipが存在するとして整理
    svm_health[destination_svm_uuid]["name"] = destination_svm.get("name", "Unknown")
    svm_health[destination_svm_uuid]["uuid"] = destination_svm_uuid


# Unhealthy な SnapMirror relationshipの情報をロギング
def log_unhealthy_relationship(rel_dict: Dict[str, Any]) -> None:
    state = rel_dict.get("state", "Unknown reason")
    unhealthy_reason = rel_dict.get("unhealthy_reason", "Unknown reason")
    relationship_uuid = rel_dict.get("uuid", "Unknown")
    source_path = rel_dict.get("source", {}).get("path", "Unknown")
    destination_path = rel_dict.get("destination", {}).get("path", "Unknown")

    adding_key = {
        "relationship": {
            "state": state,
            "unhealthy_reason": unhealthy_reason,
            "uuid": relationship_uuid,
            "source_path": source_path,
            "destination_path": destination_path,
        }
    }

    logger.info("Unhealthy SnapMirror Relationship detected", extra=adding_key)


def main() -> None:
    try:
        config.CONNECTION = get_ontap_connection()
        relationships = get_snapmirror_relationships()
        evaluate_and_report_snapmirror_health(relationships)
    except Exception as e:
        logger.exception("An unexpected error occurred: %s", e)
        sys.exit(1)


@metrics.log_metrics()
@logger.inject_lambda_context()
@tracer.capture_lambda_handler
def lambda_handler(event: dict, context: LambdaContext) -> None:
    main()
