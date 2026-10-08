// DRIFT on Azure Container Apps (ADR-0009). Deployed by infra/azure/deploy.sh, which runs it twice: first with
// deployApp=false (logs, environment, migration job), then, once the migrations have run, with deployApp=true.
//
// One container app holds three containers that share a network: web (the only one with ingress), worker and a
// Redis sidecar on 127.0.0.1. Container Apps only offers TCP between apps in environments with a custom virtual
// network; a sidecar needs none.

targetScope = 'resourceGroup'

@description('Azure region. Singapore (southeastasia), next to Neon and R2 (ADR-0008).')
param location string = resourceGroup().location

@description('Prefix of every resource name; the container app itself takes exactly this name.')
@minLength(2)
@maxLength(20)
param namePrefix string = 'drift'

@description('Where the images are, without the image name: for example ghcr.io/yugvyas10.')
param imagePrefix string

@description('The image tag: the full commit SHA the images were built from (.github/workflows/images.yml).')
param imageTag string

@description('false: only the logs, the environment and the migration job. deploy.sh runs the migrations in between.')
param deployApp bool = true

@description('Registry login for private images (a GitHub user name). Empty when the images are public.')
param registryUsername string = ''

@description('Registry password for private images (a GitHub token with read:packages).')
@secure()
param registryPassword string = ''

@description('Neon direct connection string, with connect_timeout=15 (ADR-0008).')
@secure()
param databaseUrl string

@description('Password of the Redis sidecar. deploy.sh generates a new one for every deploy.')
@secure()
param redisPassword string

@description('Signing secret of the sessions (openssl rand -base64 32). Changing it signs everybody out.')
@secure()
param authSecret string

@description('R2 S3 endpoint: https://<account id>.r2.cloudflarestorage.com')
param s3Endpoint string

param s3AccessKeyId string

@secure()
param s3SecretAccessKey string

param s3Bucket string = 'drift-artifacts'

param s3Region string = 'auto'

@description('GitHub OAuth app for "Sign in with GitHub"; leave both empty to offer email and password only.')
param githubId string = ''

@secure()
param githubSecret string = ''

@description('Log Analytics daily ingestion cap in GB. 5 GB a month is free; this keeps a runaway log well below it.')
param logDailyCapGb string = '0.15'

var registryServer = split(imagePrefix, '/')[0]
var registries = empty(registryUsername)
  ? []
  : [
      {
        server: registryServer
        username: registryUsername
        passwordSecretRef: 'registry-password'
      }
    ]
var registrySecrets = empty(registryUsername) ? [] : [{ name: 'registry-password', value: registryPassword }]
var githubSecrets = empty(githubId) ? [] : [{ name: 'github-secret', value: githubSecret }]
var githubEnv = empty(githubId)
  ? []
  : [
      { name: 'GITHUB_ID', value: githubId }
      { name: 'GITHUB_SECRET', secretRef: 'github-secret' }
    ]

var platformImage = '${imagePrefix}/drift-platform:${imageTag}'
var redisImage = '${imagePrefix}/drift-redis:${imageTag}'

// What both the web app and the worker read (apps/web/src/lib/env-schema.ts, apps/worker/src/env.ts).
var sharedEnv = [
  { name: 'DATABASE_URL', secretRef: 'database-url' }
  { name: 'REDIS_URL', secretRef: 'redis-url' }
  { name: 'S3_ENDPOINT', value: s3Endpoint }
  { name: 'S3_REGION', value: s3Region }
  { name: 'S3_BUCKET', value: s3Bucket }
  { name: 'S3_ACCESS_KEY_ID', value: s3AccessKeyId }
  { name: 'S3_SECRET_ACCESS_KEY', secretRef: 's3-secret-access-key' }
  { name: 'LOG_LEVEL', value: 'info' }
]

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${namePrefix}-logs'
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
    workspaceCapping: {
      dailyQuotaGb: json(logDailyCapGb)
    }
  }
}

// A Consumption-only environment (no workload profiles): no fixed charge, only what the containers use.
resource environment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${namePrefix}-env'
  location: location
  properties: {
    zoneRedundant: false
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
  }
}

var appUrl = 'https://${namePrefix}.${environment.properties.defaultDomain}'

// The migrations, run by deploy.sh before the new image goes live; a failure stops the deploy.
resource migrate 'Microsoft.App/jobs@2024-03-01' = {
  name: '${namePrefix}-migrate'
  location: location
  properties: {
    environmentId: environment.id
    configuration: {
      triggerType: 'Manual'
      manualTriggerConfig: {
        parallelism: 1
        replicaCompletionCount: 1
      }
      replicaTimeout: 600
      // One retry: the first connection to a Neon compute that scaled to zero can take a few seconds.
      replicaRetryLimit: 1
      secrets: concat([{ name: 'database-url', value: databaseUrl }], registrySecrets)
      registries: registries
    }
    template: {
      containers: [
        {
          name: 'migrate'
          image: platformImage
          command: ['/app/infra/container/release.sh']
          env: [{ name: 'DATABASE_URL', secretRef: 'database-url' }]
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
        }
      ]
    }
  }
}

resource app 'Microsoft.App/containerApps@2024-03-01' = if (deployApp) {
  name: namePrefix
  location: location
  properties: {
    managedEnvironmentId: environment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 3000
        transport: 'auto'
        allowInsecure: false
      }
      secrets: concat(
        [
          { name: 'database-url', value: databaseUrl }
          { name: 'redis-url', value: 'redis://default:${redisPassword}@127.0.0.1:6379' }
          { name: 'redis-password', value: redisPassword }
          { name: 'auth-secret', value: authSecret }
          { name: 's3-secret-access-key', value: s3SecretAccessKey }
        ],
        registrySecrets,
        githubSecrets
      )
      registries: registries
    }
    template: {
      // web + worker + redis = 1.25 vCPU and 2.5 GiB, a valid Consumption combination.
      containers: [
        {
          name: 'web'
          image: platformImage
          command: ['/app/infra/container/web.sh']
          env: concat(sharedEnv, githubEnv, [
            { name: 'APP_URL', value: appUrl }
            { name: 'AUTH_SECRET', secretRef: 'auth-secret' }
          ])
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          // Liveness only: /readyz queries Postgres, and probing it would keep Neon from scaling to zero.
          probes: [
            {
              type: 'Startup'
              httpGet: {
                path: '/healthz'
                port: 3000
              }
              initialDelaySeconds: 5
              periodSeconds: 5
              failureThreshold: 24
            }
            {
              type: 'Liveness'
              httpGet: {
                path: '/healthz'
                port: 3000
              }
              periodSeconds: 30
              timeoutSeconds: 5
              failureThreshold: 3
            }
          ]
        }
        {
          name: 'worker'
          image: platformImage
          command: ['/app/infra/container/worker.sh']
          env: sharedEnv
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
        }
        {
          name: 'redis'
          image: redisImage
          env: [{ name: 'REDIS_PASSWORD', secretRef: 'redis-password' }]
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 1
      }
    }
  }
}

output url string = appUrl
output migrationJob string = migrate.name
output appName string = namePrefix
