import * as cdk from "aws-cdk-lib";

export interface VpcEndpointProperty {
  vpcId: string;
  vpcEndpointSubnetSelection: cdk.aws_ec2.SubnetSelection;
  shouldCreateSsmVpcEndpoint?: boolean;
}

export interface LambdaProperty {
  vpcId: string;
  functionSubnetSelection: cdk.aws_ec2.SubnetSelection;
  functionSecurityGroupId?: string;
  functionApplicationLogLevel?: cdk.aws_lambda.ApplicationLogLevel;
  functionSystemLogLevel?: cdk.aws_lambda.SystemLogLevel;
  powertoolsLogLevel?: "DEBUG" | "INFO" | "WARNING" | "ERROR" | "CRITICAL";
  fsxnDnsName: string;
  fsxnUserName: string;
  fsxnUserCredentialSsmParameterStoreName: string;
  fsxnUserCredentialSsmParameterStoreKmsKeyId?: string;
}

export interface SchedulerProperty {
  scheduleExpression: string;
}

export interface MonitoringProperty {
  destinations: {
    svmName: string;
    svmUuid: string;
  }[];
  service: string;
  topicArn: string;
  enableOkAction?: boolean;
}

export interface SystemProperty {
  systemName: string;
  envName: string;
}

export interface TagProperty {
  key: string;

  value: string;
}

export interface MonitoringSnapMirrorRelationshipHealthProperty {
  systemProperty?: SystemProperty;
  vpcEndpointProperty?: VpcEndpointProperty;
  lambdaProperty: LambdaProperty;
  schedulerProperty?: SchedulerProperty;
  monitoringProperty?: MonitoringProperty;
}

export interface MonitoringSnapMirrorRelationshipHealthStackProperty {
  env?: cdk.Environment;
  props: MonitoringSnapMirrorRelationshipHealthProperty;
  tags?: TagProperty[];
}
