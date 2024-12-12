#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { MonitoringSnapMirrorRelationshipHealthStack } from "../lib/monitoring-snapmirror-relationship-health-stack";
import { monitoringSnapMirrorRelationshipHealthStackProperty } from "../parameter/index";

const stackName = monitoringSnapMirrorRelationshipHealthStackProperty.props
  .systemProperty
  ? `${monitoringSnapMirrorRelationshipHealthStackProperty.props.systemProperty.systemName}-${monitoringSnapMirrorRelationshipHealthStackProperty.props.systemProperty.envName}-stack-monitoring-snapmirror-health`
  : "FsxnResourcesStack";

const app = new cdk.App();
const stack = new MonitoringSnapMirrorRelationshipHealthStack(
  app,
  "MonitoringSnapmirrorRelationshipHealthStack",
  {
    stackName,
    env: monitoringSnapMirrorRelationshipHealthStackProperty.env,
    ...monitoringSnapMirrorRelationshipHealthStackProperty.props,
  }
);

monitoringSnapMirrorRelationshipHealthStackProperty.tags?.forEach((tag) => {
  cdk.Tags.of(stack).add(tag.key, tag.value);
});
