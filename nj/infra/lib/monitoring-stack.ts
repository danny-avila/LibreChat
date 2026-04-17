import * as cdk from "aws-cdk-lib";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cw_actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from "aws-cdk-lib/aws-sns";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecsPatterns from "aws-cdk-lib/aws-ecs-patterns";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2"
import { Duration } from 'aws-cdk-lib';
import { Construct } from "constructs";

export interface MonitoringStackProps extends cdk.StackProps {
    service: ecsPatterns.ApplicationLoadBalancedFargateService;
}

export class MonitoringStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: MonitoringStackProps) {
        super(scope, id, props);

        const service = props.service;

        const loadBalancer = service.loadBalancer;
        const targetGroup = service.targetGroup;

        const topic = this.createSNSTopic();
        this.createAlarms(topic, loadBalancer, targetGroup);
    }

    private createSNSTopic() {
        const topic = new sns.Topic(this, 'AlarmTopic', {
            topicName: `${cdk.Stack.of(this).stackName}-alarms`
        });
        return topic;
    }

    private createAlarms(topic: sns.Topic, loadBalancer: elbv2.IApplicationLoadBalancer, targetGroup: elbv2.IApplicationTargetGroup) {
        const unhealthyHostsAlarm = new cloudwatch.Alarm(this, 'TgUnhealthyHosts', {
            alarmName: `ai-assistant-tg-unhealthy-hosts`,
            metric: targetGroup.metrics.unhealthyHostCount({
                period: Duration.minutes(1),
                statistic: 'Sum',
            }),
            threshold: 1,
            evaluationPeriods: 3,
            datapointsToAlarm: 3,
            treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
            comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        });
        unhealthyHostsAlarm.addAlarmAction(new cw_actions.SnsAction(topic));

        const elb4xxAlarm = new cloudwatch.Alarm(this, 'AlbElb4xx', {
            alarmName: `ai-assistant-alb-elb-4xx`,
            metric: new cloudwatch.Metric({
                namespace: 'AWS/ApplicationELB',
                metricName: 'HTTPCode_ELB_4XX_Count',
                period: Duration.minutes(1),
                statistic: 'Sum',
                dimensionsMap: {
                LoadBalancer: loadBalancer.loadBalancerArn,
                },
            }),
            threshold: 10,
            evaluationPeriods: 5,
            datapointsToAlarm: 3,
            treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
            comparisonOperator:
                cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        });
        elb4xxAlarm.addAlarmAction(new cw_actions.SnsAction(topic));

        const elb5xxAlarm = new cloudwatch.Alarm(this, 'AlbElb5xx', {
            alarmName: `ai-assistant-alb-elb-5xx`,
            metric: new cloudwatch.Metric({
                namespace: 'AWS/ApplicationELB',
                metricName: 'HTTPCode_ELB_5XX_Count',
                period: Duration.minutes(1),
                statistic: 'Sum',
                dimensionsMap: {
                LoadBalancer: loadBalancer.loadBalancerArn,
                },
            }),
            threshold: 1,
            evaluationPeriods: 5,
            datapointsToAlarm: 3,
            treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
            comparisonOperator:
                cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        });
        elb5xxAlarm.addAlarmAction(new cw_actions.SnsAction(topic));

        const target5xxAlarm = new cloudwatch.Alarm(this, 'AlbTarget5xx', {
            alarmName: `ai-assistant-alb-target-5xx`,
            metric: new cloudwatch.Metric({
                namespace: 'AWS/ApplicationELB',
                metricName: 'HTTPCode_Target_5XX_Count',
                period: Duration.minutes(1),
                statistic: 'Sum',
                dimensionsMap: {
                LoadBalancer: loadBalancer.loadBalancerArn,
                TargetGroup: targetGroup.targetGroupName,
                },
            }),
            threshold: 1,
            evaluationPeriods: 5,
            datapointsToAlarm: 3,
            treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
            comparisonOperator:
                cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        });
        target5xxAlarm.addAlarmAction(new cw_actions.SnsAction(topic));
    }
}
