import { MonitoringSnapMirrorRelationshipHealthStackProperty } from "../types";
import { vpcEndpointConfig } from "./vpc-endpoint-config";
import { lambdaConfig } from "./lambda-config";
import { schedulerConfig } from "./scheduler-config";

export const monitoringSnapMirrorRelationshipHealthStackProperty: MonitoringSnapMirrorRelationshipHealthStackProperty =
  {
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: process.env.CDK_DEFAULT_REGION,
    },
    props: {
      vpcEndpointProperty: vpcEndpointConfig,
      lambdaProperty: lambdaConfig,
      schedulerProperty: schedulerConfig,
    },
  };

export { vpcEndpointConfig, lambdaConfig, schedulerConfig as scheduleConfig };
