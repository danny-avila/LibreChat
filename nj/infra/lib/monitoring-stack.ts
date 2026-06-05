import * as cdk from 'aws-cdk-lib';
import { Duration } from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cwActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as ecsPatterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Construct } from 'constructs';

export interface MonitoringStackProps extends cdk.StackProps {
  service: ecsPatterns.ApplicationLoadBalancedFargateService;
  isProd: boolean;
  rdsInstanceIdentifier?: string;
  docDbClusterIdentifier?: string;
  elastiCacheName: string;
}

export class MonitoringStack extends cdk.Stack {
  readonly #isProd: boolean;

  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);
    this.#isProd = props.isProd;

    const service = props.service;

    const loadBalancer = service.loadBalancer;
    const targetGroup = service.targetGroup;

    const topic = this.createSNSTopic();
    this.createAlarms(topic, loadBalancer, targetGroup, props);
  }

  private createSNSTopic() {
    return new sns.Topic(this, 'AlarmTopic', {
      topicName: `${cdk.Stack.of(this).stackName}-alarms`,
    });
  }

  private createAlarms(
    topic: sns.Topic,
    loadBalancer: elbv2.IApplicationLoadBalancer,
    targetGroup: elbv2.IApplicationTargetGroup,
    props: MonitoringStackProps,
  ) {
    const unhealthyHostsAlarm = new cloudwatch.Alarm(this, 'TgUnhealthyHosts', {
      alarmName: this.makeAlarmName('ai-assistant-tg-unhealthy-hosts'),
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
    unhealthyHostsAlarm.addAlarmAction(new cwActions.SnsAction(topic));

    const elb4xxAlarm = new cloudwatch.Alarm(this, 'AlbElb4xx', {
      alarmName: this.makeAlarmName('ai-assistant-alb-elb-4xx'),
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
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    });
    elb4xxAlarm.addAlarmAction(new cwActions.SnsAction(topic));

    const elb5xxAlarm = new cloudwatch.Alarm(this, 'AlbElb5xx', {
      alarmName: this.makeAlarmName('ai-assistant-alb-elb-5xx'),
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
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    });
    elb5xxAlarm.addAlarmAction(new cwActions.SnsAction(topic));

    const target5xxAlarm = new cloudwatch.Alarm(this, 'AlbTarget5xx', {
      alarmName: this.makeAlarmName('ai-assistant-alb-target-5xx'),
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
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    });
    target5xxAlarm.addAlarmAction(new cwActions.SnsAction(topic));

    if (props.rdsInstanceIdentifier) {
      this.createRdsAlarms(topic, props.rdsInstanceIdentifier);
    }

    if (this.#isProd && props.docDbClusterIdentifier) {
      this.createDocDbAlarms(topic, props.docDbClusterIdentifier);
    }

    this.createElastiCacheAlarms(topic, props.elastiCacheName);
    this.createAlbLatencyAlarms(topic, loadBalancer);
    this.createBedrockAlarms(topic);
  }

  private createRdsAlarms(topic: sns.Topic, instanceIdentifier: string) {
    const rdsDimensions = { DBInstanceIdentifier: instanceIdentifier };

    const rdsFreeStorageAlarm = new cloudwatch.Alarm(this, 'RdsFreeStorage', {
      alarmName: this.makeAlarmName('ai-assistant-rds-free-storage'),
      metric: new cloudwatch.Metric({
        namespace: 'AWS/RDS',
        metricName: 'FreeStorageSpace',
        period: Duration.minutes(5),
        statistic: 'Minimum',
        dimensionsMap: rdsDimensions,
      }),
      threshold: 10_737_418_240, // 10 GB in bytes
      evaluationPeriods: 3,
      datapointsToAlarm: 3,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_OR_EQUAL_TO_THRESHOLD,
    });
    rdsFreeStorageAlarm.addAlarmAction(new cwActions.SnsAction(topic));

    const rdsCpuAlarm = new cloudwatch.Alarm(this, 'RdsCpu', {
      alarmName: this.makeAlarmName('ai-assistant-rds-cpu'),
      metric: new cloudwatch.Metric({
        namespace: 'AWS/RDS',
        metricName: 'CPUUtilization',
        period: Duration.minutes(5),
        statistic: 'Average',
        dimensionsMap: rdsDimensions,
      }),
      threshold: 80,
      evaluationPeriods: 5,
      datapointsToAlarm: 4,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    });
    rdsCpuAlarm.addAlarmAction(new cwActions.SnsAction(topic));
  }

  private createBedrockAlarms(topic: sns.Topic) {
    const bedrockThrottlesAlarm = new cloudwatch.Alarm(this, 'BedrockThrottles', {
      alarmName: this.makeAlarmName('ai-assistant-bedrock-throttles'),
      metric: new cloudwatch.Metric({
        namespace: 'AWS/Bedrock',
        metricName: 'InvocationThrottles',
        period: Duration.minutes(1),
        statistic: 'Sum',
      }),
      threshold: 3,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    });
    bedrockThrottlesAlarm.addAlarmAction(new cwActions.SnsAction(topic));

    const bedrockServerErrorsAlarm = new cloudwatch.Alarm(this, 'BedrockServerErrors', {
      alarmName: this.makeAlarmName('ai-assistant-bedrock-server-errors'),
      metric: new cloudwatch.Metric({
        namespace: 'AWS/Bedrock',
        metricName: 'InvocationServerErrors',
        period: Duration.minutes(1),
        statistic: 'Sum',
      }),
      threshold: 1,
      evaluationPeriods: 5,
      datapointsToAlarm: 3,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    });
    bedrockServerErrorsAlarm.addAlarmAction(new cwActions.SnsAction(topic));

    for (const [id, metricName, stat, alarmName] of [
      [
        'BedrockInvocationLatency',
        'InvocationLatency',
        'p50',
        'ai-assistant-bedrock-invocation-latency-p50',
      ],
      [
        'BedrockModelInvocations',
        'ModelInvocations',
        'Sum',
        'ai-assistant-bedrock-model-invocations',
      ],
    ] as const) {
      const alarm = new cloudwatch.AnomalyDetectionAlarm(this, id, {
        alarmName: this.makeAlarmName(alarmName),
        metric: new cloudwatch.Metric({
          namespace: 'AWS/Bedrock',
          metricName,
          period: Duration.minutes(1),
          statistic: stat,
        }),
        stdDevs: 2,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_UPPER_THRESHOLD,
        evaluationPeriods: 5,
        datapointsToAlarm: 3,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
      alarm.addAlarmAction(new cwActions.SnsAction(topic));
    }
  }

  private createAlbLatencyAlarms(topic: sns.Topic, loadBalancer: elbv2.IApplicationLoadBalancer) {
    for (const [id, stat, alarmName] of [
      ['AlbLatencyP95', 'p95', 'ai-assistant-alb-latency-p95'],
      ['AlbLatencyP50', 'p50', 'ai-assistant-alb-latency-p50'],
    ] as const) {
      const alarm = new cloudwatch.AnomalyDetectionAlarm(this, id, {
        alarmName: this.makeAlarmName(alarmName),
        metric: new cloudwatch.Metric({
          namespace: 'AWS/ApplicationELB',
          metricName: 'TargetResponseTime',
          period: Duration.minutes(1),
          statistic: stat,
          dimensionsMap: { LoadBalancer: loadBalancer.loadBalancerArn },
        }),
        stdDevs: 2,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_UPPER_THRESHOLD,
        evaluationPeriods: 5,
        datapointsToAlarm: 3,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
      alarm.addAlarmAction(new cwActions.SnsAction(topic));
    }
  }

  private createElastiCacheAlarms(topic: sns.Topic, cacheName: string) {
    const currConnectionsAlarm = new cloudwatch.Alarm(this, 'ElastiCacheCurrConnections', {
      alarmName: this.makeAlarmName('ai-assistant-elasticache-curr-connections'),
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ElastiCache',
        metricName: 'CurrConnections',
        period: Duration.minutes(5),
        statistic: 'Maximum',
        dimensionsMap: { CacheClusterId: cacheName },
      }),
      threshold: 500,
      evaluationPeriods: 3,
      datapointsToAlarm: 3,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    });
    currConnectionsAlarm.addAlarmAction(new cwActions.SnsAction(topic));
  }

  private createDocDbAlarms(topic: sns.Topic, clusterIdentifier: string) {
    const docDbDimensions = { DBClusterIdentifier: clusterIdentifier };

    const docDbCpuAlarm = new cloudwatch.Alarm(this, 'DocDbCpu', {
      alarmName: this.makeAlarmName('ai-assistant-docdb-cpu'),
      metric: new cloudwatch.Metric({
        namespace: 'AWS/DocDB',
        metricName: 'CPUUtilization',
        period: Duration.minutes(5),
        statistic: 'Average',
        dimensionsMap: docDbDimensions,
      }),
      threshold: 80,
      evaluationPeriods: 5,
      datapointsToAlarm: 4,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    });
    docDbCpuAlarm.addAlarmAction(new cwActions.SnsAction(topic));

    for (const [id, metricName] of [
      ['DocDbReadLatency', 'ReadLatency'],
      ['DocDbWriteLatency', 'WriteLatency'],
    ] as const) {
      const metricNameSuffix = metricName.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
      const alarm = new cloudwatch.AnomalyDetectionAlarm(this, id, {
        alarmName: this.makeAlarmName(`ai-assistant-docdb-${metricNameSuffix}`),
        metric: new cloudwatch.Metric({
          namespace: 'AWS/DocDB',
          metricName,
          period: Duration.minutes(5),
          statistic: 'Average',
          dimensionsMap: docDbDimensions,
        }),
        stdDevs: 2,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_UPPER_THRESHOLD,
        evaluationPeriods: 5,
        datapointsToAlarm: 4,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
      alarm.addAlarmAction(new cwActions.SnsAction(topic));
    }
  }

  private makeAlarmName(base: string): string {
    return `${base}--${this.#isProd ? 'PROD' : 'DEV'}`;
  }
}
