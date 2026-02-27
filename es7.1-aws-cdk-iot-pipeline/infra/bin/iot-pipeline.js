#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { IotPipelineStack } from '../lib/iot-pipeline-stack.js';

const app = new cdk.App();

const studentName = process.env.STUDENT_NAME || 'student';

new IotPipelineStack(app, 'IotPipelineStack', {
  studentName,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1'
  }
});
