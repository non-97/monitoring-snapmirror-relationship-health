import { MonitoringSnapMirrorRelationshipHealthStackProperty } from "../types";
import { systemConfig } from "./system-config";
import { vpcEndpointConfig } from "./vpc-endpoint-config";
import { lambdaConfig } from "./lambda-config";
import { schedulerConfig } from "./scheduler-config";
import { monitoringConfig } from "./monitoring-config";
import { tagsConfig } from "./tags-config";

export const monitoringSnapMirrorRelationshipHealthStackProperty: MonitoringSnapMirrorRelationshipHealthStackProperty =
  {
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: process.env.CDK_DEFAULT_REGION,
    },
    props: {
      systemProperty: systemConfig,
      vpcEndpointProperty: vpcEndpointConfig,
      lambdaProperty: lambdaConfig,
      schedulerProperty: schedulerConfig,
      monitoringProperty: monitoringConfig,
    },
    tags: tagsConfig,
  };

export { vpcEndpointConfig, lambdaConfig, schedulerConfig as scheduleConfig };
