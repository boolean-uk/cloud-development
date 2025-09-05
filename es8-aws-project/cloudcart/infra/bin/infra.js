#!/usr/bin/env node
import 'source-map-support/register.js';
import * as cdk from 'aws-cdk-lib';
import { CloudCartStack } from '../lib/cloudcart-stack.js';

const app = new cdk.App();
new CloudCartStack(app, 'CloudCartMvpStack', {});
