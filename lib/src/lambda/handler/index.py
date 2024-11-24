import os
import json
import urllib.parse
import urllib.request
import urllib.error
import sys
import time
import math
from typing import Dict, List, Any
from collections import defaultdict
import boto3
from botocore.exceptions import ClientError, BotoCoreError
from netapp_ontap import config, HostConnection
from netapp_ontap.resources import SnapmirrorRelationship
from netapp_ontap.error import NetAppRestError
from aws_lambda_powertools import Logger

# 各種定義
NAMESPACE = os.environ.get("NAMESPACE", "ONTAP/SnapMirror")
PARAMETERS_SECRETS_EXTENSION_HTTP_PORT = os.environ.get(
    "PARAMETERS_SECRETS_EXTENSION_HTTP_PORT", "2773"
)
SSM_ENDPOINT = f"http://localhost:{PARAMETERS_SECRETS_EXTENSION_HTTP_PORT}"
SSM_PATH = "/systemsmanager/parameters/get/"
MAX_RETRIES = 4
INITIAL_DELAY = 1
MAX_DELAY = 4
MAX_METRICS_PER_REQUEST = 150


# Loggerの設定
logger = Logger()


# CloudWatch クライアントの初期化
try:
    cloudwatch = boto3.client("cloudwatch")
except (ClientError, BotoCoreError) as e:
    logger.error("Failed to initialize CloudWatch client: %s", e)
    sys.exit(1)


# AWS Parameter and Secrets Lambda extension で SSM Parameter StoreのSecure Stringを取得
def get_ssm_parameter(parameter_name: str) -> str:
    encoded_name = urllib.parse.quote(parameter_name)
    url = f"{SSM_ENDPOINT}{SSM_PATH}?name={encoded_name}&withDecryption=true"
    headers = {"X-Aws-Parameters-Secrets-Token": os.environ["AWS_SESSION_TOKEN"]}

    logger.info("Requesting SSM parameter from: %s", url)

    # "not ready to serve traffic, please wait" とエラーになることがあるため、その場合はExponential Backoffしながらリトライ
    for attempt in range(MAX_RETRIES):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req) as response:
                response_data = response.read().decode("utf-8")
            parameter = json.loads(response_data)
            return parameter["Parameter"]["Value"]
        except urllib.error.HTTPError as e:
            if (
                e.code == 400
                and "not ready to serve traffic, please wait"
                in e.read().decode("utf-8")
            ):
                delay = min(INITIAL_DELAY * (2**attempt), MAX_DELAY)
                logger.warning(
                    "Extension not ready. Retrying in %s seconds. Attempt %s/%s",
                    delay,
                    attempt + 1,
                    MAX_RETRIES,
                )
                time.sleep(delay)
            else:
                logger.error("HTTP Error %s: %s", e.code, e.reason)
                logger.error("Error response body: %s", e.read().decode("utf-8"))
                raise
        except (urllib.error.URLError, TimeoutError) as e:
            logger.error("Error fetching SSM parameter: %s", e)
            raise
        except (json.JSONDecodeError, KeyError) as e:
            logger.error("Error parsing SSM parameter response: %s", e)
            raise

    logger.error("Failed to retrieve SSM parameter after all retries.")
    raise Exception("Max retries reached for SSM parameter retrieval")


# FSxNへの接続
def get_ontap_connection() -> HostConnection:
    try:
        password = get_ssm_parameter(
            os.environ["FSXN_USER_CREDENTIAL_SSM_PARAMETER_STORE_NAME"]
        )
        return HostConnection(
            os.environ["FSXN_DNS_NAME"],
            username=os.environ["FSXN_USER_NAME"],
            password=password,
            verify=False,
        )
    except KeyError as e:
        logger.error("Missing environment variable: %s", e)
        raise
    except Exception as e:
        logger.error("Error setting up ONTAP connection: %s", e)
        raise


# SnapMirror relationshipの取得
def get_snapmirror_relationships() -> List[SnapmirrorRelationship]:
    # SnapMirror relationshipの取得
    try:
        return SnapmirrorRelationship.get_collection(fields="*")
    except NetAppRestError as error:
        logger.error("Error fetching SnapMirror relationships: %s", error)
        raise


# CloudWatchのメトリクスデータのPUT
def batch_put_metric_data(
    namespace: str, metric_data_list: List[Dict[str, Any]]
) -> None:
    total_metrics = len(metric_data_list)
    batches = math.ceil(total_metrics / MAX_METRICS_PER_REQUEST)

    for i in range(batches):
        start_idx = i * MAX_METRICS_PER_REQUEST
        end_idx = min((i + 1) * MAX_METRICS_PER_REQUEST, total_metrics)
        metric_data = metric_data_list[start_idx:end_idx]

        try:
            cloudwatch.put_metric_data(Namespace=namespace, MetricData=metric_data)
            logger.info(
                "Successfully put %d metric data points (batch %d of %d)",
                len(metric_data),
                i + 1,
                batches,
            )
        except ClientError as e:
            error_code = e.response["Error"]["Code"]
            error_message = e.response["Error"]["Message"]
            logger.error(
                "ClientError putting metric data (batch %d of %d): %s - %s",
                i + 1,
                batches,
                error_code,
                error_message,
            )
        except BotoCoreError as e:
            logger.error(
                "BotoCoreError putting metric data (batch %d of %d): %s",
                i + 1,
                batches,
                e,
            )
        except Exception as e:
            logger.error(
                "Unexpected error putting metric data (batch %d of %d): %s",
                i + 1,
                batches,
                e,
            )


# SnapMirror relationshipの個別のHealthをメトリクスとして整理
def process_individual_relationship_metrics(
    relationship: Dict[str, Any]
) -> Dict[str, Any]:
    # HealthがTrueの場合は1
    # HealthがFalseの場合は0
    health_value = 1 if relationship.get("healthy", False) else 0
    return {
        "MetricName": "SnapMirrorRelationshipHealth",
        "Dimensions": [
            {
                "Name": "SourcePath",
                "Value": relationship.get("source", {}).get("path", "Unknown"),
            },
            {
                "Name": "DestinationPath",
                "Value": relationship.get("destination", {}).get("path", "Unknown"),
            },
            {"Name": "RelationshipUUID", "Value": relationship.get("uuid", "Unknown")},
        ],
        "Value": health_value,
    }


# Destination SVM 単位のHealthをメトリクスとして整理
def process_svm_level_metrics(
    svm_health: Dict[str, Dict[str, Any]]
) -> List[Dict[str, Any]]:
    # Destination SVM 単位で、全てのSnapMirror relationshipのHealthがTrueの場合は1
    # Destination SVM 単位で、いずれかのSnapMirror relationshipのHealthがFalseの場合は0
    return [
        {
            "MetricName": "SnapMirrorRelationshipHealth",
            "Dimensions": [
                {
                    "Name": "DestinationStorageVirtualMachineName",
                    "Value": svm_info["name"],
                },
                {"Name": "DestinationStorageVirtualMachineUUID", "Value": svm_uuid},
            ],
            "Value": 1 if svm_info["healthy"] else 0,
        }
        for svm_uuid, svm_info in svm_health.items()
    ]


# 取得したSnapMirror relationshipの評価とレポーティング
def evaluate_and_report_snapmirror_health(
    relationships: List[SnapmirrorRelationship],
) -> None:
    if not relationships:
        logger.info("No SnapMirror relationships found.")
        return

    metric_data_list = []

    # Destination の SVM 単位の SnapMirror relationship の Health を確認するための変数を宣言
    svm_health = defaultdict(lambda: {"healthy": True, "name": "", "uuid": ""})

    for relationship in relationships:
        rel_dict = relationship.to_dict()
        logger.debug(
            "SnapMirror Relationship detected", extra={"relationship": rel_dict}
        )

        # 個別のSnapMirror relationshipのメトリクス
        metric_data_list.append(process_individual_relationship_metrics(rel_dict))

        # Destination SVM単位SnapMirror relationshipの状態の評価
        update_svm_health(rel_dict, svm_health)

    # Destination SVM単位SnapMirror relationshipのメトリクス
    metric_data_list.extend(process_svm_level_metrics(svm_health))

    # 一度のAPI呼び出しで全てのメトリクスを送信
    if metric_data_list:
        batch_put_metric_data(NAMESPACE, metric_data_list)


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


@logger.inject_lambda_context()
def lambda_handler(event, context) -> None:
    main()
