import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { BaseConstructProps, BaseConstruct } from "./base-construct";
import { VpcEndpointProperty } from "../../parameter";

export interface VpcEndpointConstructProps
  extends VpcEndpointProperty,
    BaseConstructProps {}

export class VpcEndpointConstruct extends BaseConstruct {
  constructor(scope: Construct, id: string, props: VpcEndpointConstructProps) {
    super(scope, id, props);

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
  }
}
