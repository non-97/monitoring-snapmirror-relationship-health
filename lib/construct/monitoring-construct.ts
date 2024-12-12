import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { BaseConstructProps, BaseConstruct } from "./base-construct";
import { MonitoringProperty, SystemProperty } from "../../parameter";

export interface MonitoringConstructProps
  extends MonitoringProperty,
    BaseConstructProps {}

export class MonitoringConstruct extends BaseConstruct {
  private readonly systemProperty?: SystemProperty;
  private readonly topic: cdk.aws_sns.ITopic;
  private readonly service: string;
  private readonly enableOkAction?: boolean;
  constructor(scope: Construct, id: string, props: MonitoringConstructProps) {
    super(scope, id, props);

    this.systemProperty = props.systemProperty;
    this.topic = cdk.aws_sns.Topic.fromTopicArn(this, "Topic", props.topicArn);
    this.service = props.service;
    this.enableOkAction = props.enableOkAction;

    props.destinations.forEach((destination) => {
      this.alarmSnapMirrorRelationshipHealth(
        destination.svmName,
        destination.svmUuid
      );
    });
  }

  // SnapMirror relationshipのDestination SVM単位の監視
  private alarmSnapMirrorRelationshipHealth(
    destinationStorageVirtualMachineName: string,
    destinationStorageVirtualMachineUUID: string
  ): void {
    const metricName = "SnapMirrorRelationshipHealth";
    const alarmUniqueName = `${destinationStorageVirtualMachineName}-${metricName}`;
    const threshold = 1;
    const evaluationPeriods = 1;

    const alarmName = this.systemProperty
      ? this.generateResourceName("cw-alarm", alarmUniqueName)
      : alarmUniqueName;

    const alarm = new cdk.aws_cloudwatch.Alarm(
      this,
      `Alarm${this.toPascalCase(alarmUniqueName)}`,
      {
        metric: new cdk.aws_cloudwatch.Metric({
          namespace: "ONTAP/SnapMirror",
          metricName,
          dimensionsMap: {
            DestinationStorageVirtualMachineName:
              destinationStorageVirtualMachineName,
            DestinationStorageVirtualMachineUUID:
              destinationStorageVirtualMachineUUID,
            service: this.service,
          },
          period: cdk.Duration.seconds(300),
          statistic: "Maximum",
        }),
        threshold,
        evaluationPeriods,
        comparisonOperator:
          cdk.aws_cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
        alarmName,
        treatMissingData: cdk.aws_cloudwatch.TreatMissingData.BREACHING,
      }
    );

    cdk.Tags.of(alarm).add("Name", alarmName);

    alarm.addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(this.topic));

    if (this.enableOkAction) {
      alarm.addOkAction(new cdk.aws_cloudwatch_actions.SnsAction(this.topic));
    }
  }
}
