import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { BaseConstructProps, BaseConstruct } from "./base-construct";
import { LambdaProperty } from "../../parameter";
import * as path from "path";

export interface LambdaConstructProps
  extends LambdaProperty,
    BaseConstructProps {}

export class LambdaConstruct extends BaseConstruct {
  readonly lambdaFunction: cdk.aws_lambda.IFunction;
  constructor(scope: Construct, id: string, props: LambdaConstructProps) {
    super(scope, id, props);

    // VPC
    const vpc = cdk.aws_ec2.Vpc.fromLookup(this, "Vpc", {
      vpcId: props.vpcId,
    });

    // Security Group
    const securityGroupName = props.systemProperty
      ? this.generateResourceName("sg", "monitoring-snapmirror-health")
      : undefined;

    const securityGroup = props.functionSecurityGroupId
      ? cdk.aws_ec2.SecurityGroup.fromSecurityGroupId(
          this,
          "SecurityGroup",
          props.functionSecurityGroupId
        )
      : new cdk.aws_ec2.SecurityGroup(this, "SecurityGroup", {
          vpc,
          securityGroupName,
        });

    if (securityGroupName) {
      cdk.Tags.of(securityGroup).add("Name", securityGroupName);
    }

    // IAM Policy
    const policyName = props.systemProperty
      ? this.generateResourceName(
          "policy",
          "monitoring-snapmirror-health-lambda"
        )
      : undefined;
    const policy = new cdk.aws_iam.Policy(
      this,
      "MonitoringSnapMirrorRelationshipHealthPolicy",
      {
        policyName,
        statements: [
          new cdk.aws_iam.PolicyStatement({
            effect: cdk.aws_iam.Effect.ALLOW,
            resources: ["*"],
            actions: ["xray:PutTelemetryRecords", "xray:PutTraceSegments"],
          }),
          new cdk.aws_iam.PolicyStatement({
            effect: cdk.aws_iam.Effect.ALLOW,
            resources: [
              `arn:aws:ssm:${cdk.Stack.of(this).region}:${
                cdk.Stack.of(this).account
              }:parameter/${
                props.fsxnUserCredentialSsmParameterStoreName
              }`.replace(/\/+/g, "/"),
            ],
            actions: ["ssm:GetParameter"],
          }),
        ],
      }
    );

    if (props.fsxnUserCredentialSsmParameterStoreKmsKeyId) {
      policy.addStatements(
        new cdk.aws_iam.PolicyStatement({
          effect: cdk.aws_iam.Effect.ALLOW,
          resources: [
            `arn:aws:kms:${cdk.Stack.of(this).region}:${
              cdk.Stack.of(this).account
            }:key/${props.fsxnUserCredentialSsmParameterStoreKmsKeyId}`,
          ],
          actions: ["kms:Decrypt"],
        })
      );
    }

    // IAM Role
    const roleName = props.systemProperty
      ? this.generateResourceName("role", "monitoring-snapmirror-health-lambda")
      : undefined;
    const role = new cdk.aws_iam.Role(this, "Role", {
      assumedBy: new cdk.aws_iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaBasicExecutionRole"
        ),
        cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaVPCAccessExecutionRole"
        ),
      ],
      roleName,
    });
    role.attachInlinePolicy(policy);
    if (roleName) {
      cdk.Tags.of(role).add("Name", roleName);
    }

    // Lambda Layer
    const layerVersionName = props.systemProperty
      ? this.generateResourceName("layer", "monitoring-snapmirror-health")
      : undefined;
    const layer = new cdk.aws_lambda.LayerVersion(this, "Layer", {
      code: cdk.aws_lambda.Code.fromAsset(
        path.join(__dirname, "../src/lambda/layer"),
        {
          bundling: {
            image: cdk.aws_lambda.Runtime.PYTHON_3_13.bundlingImage,
            command: [
              "bash",
              "-c",
              "pip install -r requirements.txt -t /asset-output/python && cp -au . /asset-output/python",
            ],
          },
        }
      ),
      compatibleArchitectures: [cdk.aws_lambda.Architecture.ARM_64],
      compatibleRuntimes: [cdk.aws_lambda.Runtime.PYTHON_3_13],
      layerVersionName,
    });

    const lambdaPowertoolsLayer =
      cdk.aws_lambda.LayerVersion.fromLayerVersionArn(
        this,
        "lambdaPowertoolsLayer",
        `arn:aws:lambda:${
          cdk.Stack.of(this).region
        }:017000801446:layer:AWSLambdaPowertoolsPythonV3-python313-arm64:4`
      );

    // Lambda Function
    const functionName = props.systemProperty
      ? this.generateResourceName("lambda", "monitoring-snapmirror-health")
      : undefined;
    const lambdaFunction = new cdk.aws_lambda.Function(this, "Default", {
      runtime: cdk.aws_lambda.Runtime.PYTHON_3_13,
      handler: "index.lambda_handler",
      code: cdk.aws_lambda.Code.fromAsset(
        path.join(__dirname, "../src/lambda/handler")
      ),
      role,
      vpc,
      vpcSubnets: vpc.selectSubnets(props.functionSubnetSelection),
      securityGroups: [securityGroup],
      architecture: cdk.aws_lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(20),
      tracing: cdk.aws_lambda.Tracing.ACTIVE,
      logRetention: cdk.aws_logs.RetentionDays.ONE_MONTH,
      loggingFormat: cdk.aws_lambda.LoggingFormat.JSON,
      applicationLogLevelV2: props.functionApplicationLogLevel,
      systemLogLevelV2: props.functionSystemLogLevel,
      layers: [layer, lambdaPowertoolsLayer],
      environment: {
        POWERTOOLS_LOG_LEVEL: props.powertoolsLogLevel || "INFO",
        POWERTOOLS_SERVICE_NAME: "monitoring-snapmirror-health",
        POWERTOOLS_METRICS_NAMESPACE: "ONTAP/SnapMirror",
        POWERTOOLS_PARAMETERS_MAX_AGE: "300",
        FSXN_DNS_NAME: props.fsxnDnsName,
        FSXN_USER_NAME: props.fsxnUserName,
        FSXN_USER_CREDENTIAL_SSM_PARAMETER_STORE_NAME:
          props.fsxnUserCredentialSsmParameterStoreName,
      },
      functionName,
    });
    if (functionName) {
      cdk.Tags.of(lambdaFunction).add("Name", functionName);
    }

    role.node.tryRemoveChild("DefaultPolicy");

    this.lambdaFunction = lambdaFunction;
  }
}
