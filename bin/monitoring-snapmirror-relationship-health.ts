#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { MonitoringSnapMirrorRelationshipHealthStack } from "../lib/monitoring-snapmirror-relationship-health-stack";
import { monitoringSnapMirrorRelationshipHealthStackProperty } from "../parameter/index";

const app = new cdk.App();
new MonitoringSnapMirrorRelationshipHealthStack(
  app,
  "MonitoringSnapmirrorRelationshipHealthStack",
  {
    env: monitoringSnapMirrorRelationshipHealthStackProperty.env,
    ...monitoringSnapMirrorRelationshipHealthStackProperty.props,
  }
);
