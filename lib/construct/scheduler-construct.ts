import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { SchedulerProperty } from "../../parameter";

export interface SchedulerConstructProps extends SchedulerProperty {
  targetFunction: cdk.aws_lambda.IFunction;
}

export class SchedulerConstruct extends Construct {
  constructor(scope: Construct, id: string, props: SchedulerConstructProps) {
    super(scope, id);

    // Role
    const role = new cdk.aws_iam.Role(this, "Role", {
      assumedBy: new cdk.aws_iam.ServicePrincipal("scheduler.amazonaws.com"),
      managedPolicies: [
        new cdk.aws_iam.ManagedPolicy(this, "InvokeFunction", {
          statements: [
            new cdk.aws_iam.PolicyStatement({
              effect: cdk.aws_iam.Effect.ALLOW,
              resources: [props.targetFunction.functionArn],
              actions: ["lambda:InvokeFunction"],
            }),
          ],
        }),
      ],
    });

    const scheduleGroup = new cdk.aws_scheduler.CfnScheduleGroup(
      this,
      "ScheduleGroup"
    );

    // EventBridge Scheduler
    new cdk.aws_scheduler.CfnSchedule(this, "Default", {
      flexibleTimeWindow: {
        mode: "OFF",
      },
      groupName: scheduleGroup.name,
      scheduleExpression: props.scheduleExpression,
      target: {
        arn: props.targetFunction.functionArn,
        roleArn: role.roleArn,
        retryPolicy: {
          maximumEventAgeInSeconds: 60,
          maximumRetryAttempts: 0,
        },
      },
      scheduleExpressionTimezone: "Asia/Tokyo",
      state: "ENABLED",
    });
  }
}
