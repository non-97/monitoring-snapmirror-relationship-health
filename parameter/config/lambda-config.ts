import * as cdk from "aws-cdk-lib";
import { LambdaProperty } from "../types";

export const lambdaConfig: LambdaProperty = {
  vpcId: "vpc-043c0858ea33e8ec2",
  functionSubnetSelection: {
    subnetType: cdk.aws_ec2.SubnetType.PRIVATE_ISOLATED,
    availabilityZones: ["us-east-1a"],
    subnetFilters: [
      cdk.aws_ec2.SubnetFilter.byIds(["subnet-0ddc1cafa116ba0dd"]),
    ],
  },
  functionSecurityGroupId: "sg-03730d9e2b49e7cbc",
  functionApplicationLogLevel: cdk.aws_lambda.ApplicationLogLevel.INFO,
  functionSystemLogLevel: cdk.aws_lambda.SystemLogLevel.INFO,
  fsxnDnsName: "management.fs-0e64a4f5386f74c87.fsx.us-east-1.amazonaws.com",
  fsxnUserName: "fsxadmin-readonly",
  fsxnUserCredentialSsmParameterStoreName:
    "/fsxn/non-97-fsxn/fsxadmin-readonly/password2",
  fsxnUserCredentialSsmParameterStoreKmsKeyId:
    "6233b0b8-a26b-4f0d-8589-ac35b7152932",
};
