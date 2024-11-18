import * as cdk from "aws-cdk-lib";

export interface VpcEndpointProperty {
  vpcId: string;
  vpcEndpointSubnetSelection: cdk.aws_ec2.SubnetSelection;
  shouldCreateSsmVpcEndpoint?: boolean;
  shouldCreateCloudWatchVpcEndpoint?: boolean;
}

export interface LambdaProperty {
  vpcId: string;
  functionSubnetSelection: cdk.aws_ec2.SubnetSelection;
  functionSecurityGroupId?: string;
  functionApplicationLogLevel?: cdk.aws_lambda.ApplicationLogLevel;
  functionSystemLogLevel?: cdk.aws_lambda.SystemLogLevel;
  paramsAndSecretsLogLevel?: cdk.aws_lambda.ParamsAndSecretsLogLevel;
  fsxnDnsName: string;
  fsxnUserName: string;
  fsxnUserCredentialSsmParameterStoreName: string;
  fsxnUserCredentialSsmParameterStoreKmsKeyId?: string;
}

export interface SchedulerProperty {
  scheduleExpression: string;
}

export interface MonitoringSnapMirrorRelationshipHealthProperty {
  vpcEndpointProperty?: VpcEndpointProperty;
  lambdaProperty: LambdaProperty;
  schedulerProperty?: SchedulerProperty;
}

export interface MonitoringSnapMirrorRelationshipHealthStackProperty {
  env?: cdk.Environment;
  props: MonitoringSnapMirrorRelationshipHealthProperty;
}
