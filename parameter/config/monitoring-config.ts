import { MonitoringProperty } from "../types";

export const monitoringConfig: MonitoringProperty = {
  destinations: [
    {
      svmName: "svm",
      svmUuid: "3ba0f5ee-6064-11ef-a92a-512f30fadf39",
    },
    {
      svmName: "svm2",
      svmUuid: "2bb6c4fc-a554-11ef-accd-b31c82a68aa5",
    },
  ],
  service: "monitoring-snapmirror-health",
  topicArn:
    "arn:aws:sns:us-east-1:<123456789012>:non-97-dev-stack-fsxn-resources-MonitoringConstructTopic9E0A8832-D2LGQAtrknkW",
  enableOkAction: true,
};
