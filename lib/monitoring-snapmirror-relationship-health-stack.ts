import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { MonitoringSnapMirrorRelationshipHealthProperty } from "../parameter/index";
import { VpcEndpointConstruct } from "./construct/vpc-endpoint-construct";
import { LambdaConstruct } from "./construct/lambda-construct";
import { SchedulerConstruct } from "./construct/scheduler-construct";

export interface MonitoringSnapMirrorRelationshipHealthStackProps
  extends cdk.StackProps,
    MonitoringSnapMirrorRelationshipHealthProperty {}

export class MonitoringSnapMirrorRelationshipHealthStack extends cdk.Stack {
  constructor(
    scope: Construct,
    id: string,
    props: MonitoringSnapMirrorRelationshipHealthStackProps
  ) {
    super(scope, id, props);

    // VPC Endpoint
    if (props.vpcEndpointProperty) {
      new VpcEndpointConstruct(this, "VpcEndpointConstruct", {
        systemProperty: props.systemProperty,
        ...props.vpcEndpointProperty,
      });
    }

    // Lambda
    const lambdaConstruct = new LambdaConstruct(this, "LambdaConstruct", {
      systemProperty: props.systemProperty,
      ...props.lambdaProperty,
    });

    // EventBridge Scheduler
    if (props.schedulerProperty) {
      new SchedulerConstruct(this, "SchedulerConstruct", {
        systemProperty: props.systemProperty,
        targetFunction: lambdaConstruct.lambdaFunction,
        ...props.schedulerProperty,
      });
    }
  }
}
