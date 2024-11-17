import * as cdk from "aws-cdk-lib";
import { VpcEndpointProperty } from "../types";

export const vpcEndpointConfig: VpcEndpointProperty = {
  vpcId: "vpc-043c0858ea33e8ec2",
  vpcEndpointSubnetSelection: {
    subnetType: cdk.aws_ec2.SubnetType.PRIVATE_ISOLATED,
    availabilityZones: ["us-east-1a"],
    subnetFilters: [
      cdk.aws_ec2.SubnetFilter.byIds(["subnet-0ddc1cafa116ba0dd"]),
    ],
  },
  shouldCreateSsmVpcEndpoint: true,
  shouldCreateCloudWatchVpcEndpoint: true,
};
