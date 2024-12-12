import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { BaseConstructProps, BaseConstruct } from "./base-construct";
import { SchedulerProperty } from "../../parameter";

export interface SchedulerConstructProps
  extends SchedulerProperty,
    BaseConstructProps {
  targetFunction: cdk.aws_lambda.IFunction;
}

export class SchedulerConstruct extends BaseConstruct {
  constructor(scope: Construct, id: string, props: SchedulerConstructProps) {
    super(scope, id, props);

    // Role
    const roleName = props.systemProperty
      ? this.generateResourceName(
          "role",
          "monitoring-snapmirror-health-scheduler"
        )
      : undefined;
    const role = new cdk.aws_iam.Role(this, "Role", {
      assumedBy: new cdk.aws_iam.ServicePrincipal("scheduler.amazonaws.com"),
      inlinePolicies: {
        InvokeFunction: new cdk.aws_iam.PolicyDocument({
          statements: [
            new cdk.aws_iam.PolicyStatement({
              effect: cdk.aws_iam.Effect.ALLOW,
              resources: [props.targetFunction.functionArn],
              actions: ["lambda:InvokeFunction"],
            }),
          ],
        }),
      },
      roleName,
    });
    if (roleName) {
      cdk.Tags.of(role).add("Name", roleName);
    }

    // EventBridge Scheduler Group
    const scheduleGroupName = props.systemProperty
      ? this.generateResourceName(
          "schedule-group",
          "monitoring-snapmirror-health"
        )
      : "MonitoringSnapmirrorHealthScheduleGroup";
    const scheduleGroup = new cdk.aws_scheduler.CfnScheduleGroup(
      this,
      "ScheduleGroup",
      {
        name: scheduleGroupName,
      }
    );
    cdk.Tags.of(scheduleGroup).add("Name", scheduleGroupName);

    // EventBridge Scheduler
    const scheduleName = props.systemProperty
      ? this.generateResourceName(
          "schedule-group",
          "monitoring-snapmirror-health"
        )
      : "MonitoringSnapmirrorHealthSchedule";
    const schedule = new cdk.aws_scheduler.CfnSchedule(this, "Default", {
      flexibleTimeWindow: {
        mode: "OFF",
      },
      groupName: scheduleGroup.name,
      name: scheduleName,
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
    cdk.Tags.of(schedule).add("Name", scheduleName);
  }
}
