import os
import logging
import json
import urllib.parse
import urllib.request
import urllib.error
import boto3
import sys
import time
from typing import Dict, List, Any
from collections import defaultdict
from botocore.exceptions import ClientError, BotoCoreError
from netapp_ontap import config, HostConnection
from netapp_ontap.resources import SnapmirrorRelationship
from netapp_ontap.error import NetAppRestError
from aws_xray_sdk.core import patch_all


# 各種定義
NAMESPACE = os.environ.get('NAMESPACE', 'ONTAP/SnapMirror')
PARAMETERS_SECRETS_EXTENSION_HTTP_PORT = os.environ.get('PARAMETERS_SECRETS_EXTENSION_HTTP_PORT', '2773').upper()
SSM_ENDPOINT = 'http://localhost:' + PARAMETERS_SECRETS_EXTENSION_HTTP_PORT
SSM_PATH = '/systemsmanager/parameters/get/'
MAX_RETRIES = 4
INITIAL_DELAY = 1
MAX_DELAY = 4


# Loggerの設定
def setup_logger() -> logging.Logger:
    log_level = os.environ.get('LOG_LEVEL', 'INFO').upper()
    logging.basicConfig(
        level=getattr(logging, log_level),
        format='%(asctime)s [%(levelname)s] %(name)s %(message)s'
    )
    return logging.getLogger(__name__)


logger = setup_logger()


# urllib にパッチ適用するには 二重パッチ適用が必要
patch_all(double_patch=True)


# CloudWatch クライアントの初期化
try:
    cloudwatch = boto3.client('cloudwatch')
except (ClientError, BotoCoreError) as e:
    logger.error(f"Failed to initialize CloudWatch client: {e}")
    sys.exit(1)


# AWS Parameter and Secrets Lambda extension で SSM Parameter StoreのSecure Stringを取得
def get_ssm_parameter(parameter_name: str) -> str:
    encoded_name = urllib.parse.quote(parameter_name)
    url = f"{SSM_ENDPOINT}{SSM_PATH}?name={encoded_name}&withDecryption=true"
    headers = {'X-Aws-Parameters-Secrets-Token': os.environ['AWS_SESSION_TOKEN']}

    logger.info(f"Requesting SSM parameter from: {url}")

    # "not ready to serve traffic, please wait" とエラーになることがあるため、その場合はExponential Backoffしながらリトライ
    for attempt in range(MAX_RETRIES):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req) as response:
                response_data = response.read().decode('utf-8')
            parameter = json.loads(response_data)
            return parameter['Parameter']['Value']
        except urllib.error.HTTPError as e:
            if e.code == 400 and "not ready to serve traffic, please wait" in e.read().decode('utf-8'):
                delay = min(INITIAL_DELAY * (2 ** attempt), MAX_DELAY)
                logger.warning(f"Extension not ready. Retrying in {delay} seconds. Attempt {attempt + 1}/{MAX_RETRIES}")
                time.sleep(delay)
            else:
                logger.error(f"HTTP Error {e.code}: {e.reason}")
                logger.error(f"Error response body: {e.read().decode('utf-8')}")
                raise
        except (urllib.error.URLError, TimeoutError) as e:
            logger.error(f"Error fetching SSM parameter: {e}")
            raise
        except (json.JSONDecodeError, KeyError) as e:
            logger.error(f"Error parsing SSM parameter response: {e}")
            raise

    logger.error("Failed to retrieve SSM parameter after all retries.")
    raise Exception("Max retries reached for SSM parameter retrieval")


# FSxNへの接続
def get_ontap_connection() -> HostConnection:
    try:
        password = get_ssm_parameter(os.environ['FSXN_USER_CREDENTIAL_SSM_PARAMETER_STORE_NAME'])
        return HostConnection(
            os.environ['FSXN_DNS_NAME'],
            username=os.environ['FSXN_USER_NAME'],
            password=password,
            verify=False
        )
    except KeyError as e:
        logger.error(f"Missing environment variable: {e}")
        raise
    except Exception as e:
        logger.error(f"Error setting up ONTAP connection: {e}")
        raise


# SnapMirror relationshipの取得
def get_snapmirror_relationships() -> List[SnapmirrorRelationship]:
    # SnapMirror relationshipの取得
    try:
        return SnapmirrorRelationship.get_collection(fields='*')
    except NetAppRestError as error:
        logger.error(f"Error fetching SnapMirror relationships: {error}")
        raise


# CloudWatchのメトリクスデータのPUT
def put_metric_data(metric_name: str, value: float, dimensions: List[Dict[str, str]]) -> None:
    try:
        cloudwatch.put_metric_data(
            Namespace=NAMESPACE,
            MetricData=[
                {
                    'MetricName': metric_name,
                    'Value': value,
                    'Dimensions': dimensions
                }
            ]
        )
        logger.info(f"Successfully put metric data: {metric_name}")
    except ClientError as e:
        error_code = e.response['Error']['Code']
        error_message = e.response['Error']['Message']
        logger.error(f"ClientError putting metric data: {error_code} - {error_message}")
    except BotoCoreError as e:
        logger.error(f"BotoCoreError putting metric data: {e}")
    except Exception as e:
        logger.error(f"Unexpected error putting metric data: {e}")


# 取得したSnapMirror relationshipの評価とレポーティング
def evaluate_and_report_snapmirror_health(relationships: List[SnapmirrorRelationship]) -> None:
    if not relationships:
        logger.info("No SnapMirror relationships found.")
        return

    # Destination の SVM 単位の SnapMirror relationship の Health を確認するための変数を宣言
    svm_health = defaultdict(lambda: {'healthy': True, 'name': '', 'uuid': ''})

    for relationship in relationships:
        rel_dict = relationship.to_dict()
        logger.debug(f"SnapMirror Relationship: {rel_dict}")

        # SnapMirror relationship個別の状態のレポート
        report_individual_relationship_health(rel_dict)

        # Destination SVM単位SnapMirror relationshipの状態の評価
        update_svm_health(rel_dict, svm_health)

    # Destination SVM単位SnapMirror relationshipの状態のレポート
    report_svm_level_health(svm_health)


# SnapMirror relationshipの個別のHealthをメトリクスとしてPUT
def report_individual_relationship_health(rel_dict: Dict[str, Any]) -> None:
    # HealthがTrueの場合は1
    # HealthがFalseの場合は0
    health_value = 1 if rel_dict.get('healthy', False) else 0
    dimensions = [
        {'Name': 'SourcePath', 'Value': rel_dict.get('source', {}).get('path', 'Unknown')},
        {'Name': 'DestinationPath', 'Value': rel_dict.get('destination', {}).get('path', 'Unknown')},
        {'Name': 'RelationshipUUID', 'Value': rel_dict.get('uuid', 'Unknown')}
    ]
    put_metric_data('SnapMirrorRelationshipHealth', health_value, dimensions)


# Destination SVM単位SnapMirror relationshipの状態の評価
def update_svm_health(rel_dict: Dict[str, Any], svm_health: Dict[str, Dict[str, Any]]) -> None:
    destination_svm = rel_dict.get('destination', {}).get('svm', {})
    destination_svm_uuid = destination_svm.get('uuid', 'Unknown')

    # SnapMirror relationshipがHealthではない場合、該当SnapMirror relationshipの詳細をログに記録
    if not rel_dict.get('healthy', False):
        svm_health[destination_svm_uuid]['healthy'] = False
        log_unhealthy_relationship(rel_dict)

    # UnhealthyなSnapMirror relationshipが存在するとして整理
    svm_health[destination_svm_uuid]['name'] = destination_svm.get('name', 'Unknown')
    svm_health[destination_svm_uuid]['uuid'] = destination_svm_uuid


# Destination SVM 単位でメトリクスをPUT
def report_svm_level_health(svm_health: Dict[str, Dict[str, Any]]) -> None:
    # Destination SVM 単位で、全てのSnapMirror relationshipのHealthがTrueの場合は1
    # Destination SVM 単位で、いずれかのSnapMirror relationshipのHealthがFalseの場合は0
    for svm_uuid, svm_info in svm_health.items():
        health_value = 1 if svm_info['healthy'] else 0
        dimensions = [
            {'Name': 'DestinationStorageVirtualMachineName', 'Value': svm_info['name']},
            {'Name': 'DestinationStorageVirtualMachineUUID', 'Value': svm_uuid}
        ]
        put_metric_data('SnapMirrorRelationshipHealth', health_value, dimensions)


# Unhealthy な SnapMirror relationshipの情報をロギング
def log_unhealthy_relationship(rel_dict: Dict[str, Any]) -> None:
    unhealthy_reason = rel_dict.get('unhealthy_reason', 'Unknown reason')
    relationship_uuid = rel_dict.get('uuid', 'Unknown')
    source_path = rel_dict.get('source', {}).get('path', 'Unknown')
    destination_path = rel_dict.get('destination', {}).get('path', 'Unknown')

    logger.info(
        f"Unhealthy SnapMirror Relationship detected "
        f"Unhealthy Reason: {unhealthy_reason}, "
        f"Relationship UUID: {relationship_uuid}, "
        f"Source Path: {source_path}, "
        f"Destination Path: {destination_path}"
    )


def main():
    try:
        config.CONNECTION = get_ontap_connection()
        relationships = get_snapmirror_relationships()
        evaluate_and_report_snapmirror_health(relationships)
    except Exception as e:
        logger.exception(f"An unexpected error occurred: {e}")
        sys.exit(1)


def lambda_handler(event, context):
    main()
