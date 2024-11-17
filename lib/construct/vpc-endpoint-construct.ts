import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { VpcEndpointProperty } from "../../parameter";

export interface VpcEndpointConstructProps extends VpcEndpointProperty {}

export class VpcEndpointConstruct extends Construct {
  constructor(scope: Construct, id: string, props: VpcEndpointConstructProps) {
    super(scope, id);

    // VPC
    const vpc = cdk.aws_ec2.Vpc.fromLookup(this, "Vpc", {
      vpcId: props.vpcId,
    });

    // SSM
    if (props.shouldCreateSsmVpcEndpoint) {
      vpc.addInterfaceEndpoint("SsmEndpoint", {
        service: cdk.aws_ec2.InterfaceVpcEndpointAwsService.SSM,
        subnets: vpc.selectSubnets(props.vpcEndpointSubnetSelection),
      });
    }

    // CloudWatch
    if (props.shouldCreateCloudWatchVpcEndpoint) {
      vpc.addInterfaceEndpoint("CloudWatchEndpoint", {
        service:
          cdk.aws_ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_MONITORING,
        subnets: vpc.selectSubnets(props.vpcEndpointSubnetSelection),
      });
    }
  }
}
