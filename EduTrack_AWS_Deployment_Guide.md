
# EduTrack: AWS Deployment and Demonstration Guide

This guide explains how to adapt the existing [EduTrack repository](https://github.com/Zawalid/EduTrack) for an AWS project that demonstrates relational and NoSQL databases, availability, monitoring, security, and cost management.

> **Important:** EduTrack is someone else's project. Treat it as an unfamiliar codebase. First get it running locally, inspect its configuration, and then adapt it incrementally. The commands and configurations below are examples; confirm service names, versions, environment variables, and routes against the actual repository before using them.

## 1. Project goals and target architecture

The application must support student registration, record insertion, retrieval, and updates. The AWS environment must also demonstrate RDS Multi-AZ, read replicas, Aurora, DynamoDB Streams, monitoring, auditing, security controls, and billing.

### Target architecture

```text
                         Users
                           |
                           v
                    AWS WAF (web ACL)
                           |
                           v
                 Application Load Balancer
                           |
                           v
                  EC2 / Docker Containers
                           |
                  +--------+---------+
                  |                  |
                  v                  v
           Student Service     Grades Service
                  |                  |
                  v                  v
             Amazon RDS          Existing MongoDB
                  |
           Multi-AZ / Read Replica
                  |
           Aurora (separate comparison/demo)

           Supplementary student data
                           |
                           v
                       DynamoDB
                           |
                    DynamoDB Streams
                           |
                           v
                         Lambda
                           |
                           v
                    CloudWatch Logs

 Supporting services: IAM, KMS, CloudWatch, CloudTrail,
 AWS Config, Systems Manager, Trusted Advisor, Budgets
```

This is the intended architecture, not EduTrack's existing architecture. Its database integrations and deployment configuration will need changes.

### Important design decisions

| Requirement | Demonstration |
|---|---|
| RDS Multi-AZ | High availability and automatic failover |
| RDS Read Replica | Read scaling using a separate database instance |
| Aurora | Separate relational database option compared with standard RDS |
| DynamoDB Streams | Capturing item changes for downstream processing |
| CloudWatch | Metrics, application logs, and alarms |
| CloudTrail | Auditing AWS API activity |
| AWS Config | Tracking supported configuration changes and evaluating rules |
| Systems Manager | Secure instance access and configuration management |
| WAF and Shield | Web request filtering and DDoS protection |
| KMS | Encryption key management |
| Budgets | Actual and forecast spending alerts |

You do not need to run every database configuration at once. Use planned demonstration stages to limit cost.

---

## Phase 1 — Prepare your computer and copy EduTrack

### 1.1 Choose an AWS Region

Use **Asia Pacific (Mumbai), `ap-south-1`**, unless your existing resources or credits require another region.

1. Sign in to the [AWS Management Console](https://console.aws.amazon.com/).
2. Open the Region selector.
3. Select **Asia Pacific (Mumbai)**.
4. Keep EC2, RDS, DynamoDB, CloudWatch, Systems Manager, and other regional resources in the same Region.

**CloudFront exception:** If you protect the site through CloudFront, its associated WAF resources are configured in **US East (N. Virginia), `us-east-1`**, because CloudFront is global. See the [AWS WAF resource documentation](https://docs.aws.amazon.com/waf/latest/developerguide/how-aws-waf-works-resources.html).

### 1.2 Fork and clone the repository

1. Open [EduTrack on GitHub](https://github.com/Zawalid/EduTrack).
2. Select **Fork** and create a copy under your GitHub account.
3. On Ubuntu, install basic tools:

```bash
sudo apt update
sudo apt install -y git curl unzip
```

Install Docker using the [official Docker Engine instructions for Ubuntu](https://docs.docker.com/engine/install/ubuntu/). Verify:

```bash
git --version
docker --version
docker compose version
```

Clone your fork, replacing `YOUR_GITHUB_USERNAME`:

```bash
mkdir -p ~/Documents/aws-projects
cd ~/Documents/aws-projects

git clone https://github.com/YOUR_GITHUB_USERNAME/EduTrack.git
cd EduTrack

git remote add upstream https://github.com/Zawalid/EduTrack.git
git remote -v

git switch -c aws-deployment
```

Work in your fork; do not modify the original author's repository.

### 1.3 Inspect the codebase

The repository's documented structure includes:

| Directory/file | Purpose |
|---|---|
| `frontend/` | Next.js user interface |
| `backend-spring-boot/` | Java/Spring Boot student service |
| `backend-node-js/` | Node.js/Fastify grades service |
| `middleware/` | Kong API gateway configuration |
| `docker-compose.yaml` | Local application infrastructure |
| `Guide.md` | Setup guide |

The documented design uses MySQL for student data and MongoDB for grades, plus Kafka, ZooKeeper, and Kong-related services. Verify these details against the current branch.

Run:

```bash
cd ~/Documents/aws-projects/EduTrack

find . -maxdepth 3 -type f \
  \( -name 'README.md' \
  -o -name 'package.json' \
  -o -name 'pom.xml' \
  -o -name 'Dockerfile' \
  -o -name 'docker-compose.yaml' \
  -o -name '.env.example' \
  -o -name 'application.properties' \
  -o -name 'application.yml' \) \
  -print

git status
cat docker-compose.yaml
```

Inspect database and configuration references:

```bash
grep -RInE \
  'jdbc:mysql|mongodb://|MONGO_URI|MYSQL_HOST|DB_HOST|DATABASE_URL|NEXTAUTH_URL|GOOGLE_CLIENT_ID' \
  backend-spring-boot backend-node-js frontend middleware \
  --exclude-dir=node_modules \
  --exclude-dir=target \
  --exclude-dir=.git
```

This is an inspection command. Do not publish its output if it contains credentials.

Identify:
- Authentication and login requirements.
- Backend ports and Kong routes.
- Spring Boot's MySQL connection configuration.
- Node.js/Mongoose's MongoDB connection configuration.
- Database schemas and initialization scripts.
- Required OAuth and frontend environment variables.

### 1.4 Run the original application locally

From the repository root:

```bash
docker compose config
docker compose up -d --build
docker compose ps
docker compose logs --tail=100
```

If a service fails, inspect logs using the actual service names from `docker compose ps`:

```bash
docker compose logs --tail=200 SERVICE_NAME
```

Inspect frontend scripts:

```bash
cd ~/Documents/aws-projects/EduTrack/frontend
cat package.json
```

If the frontend uses standard npm scripts:

```bash
pnpm install
npm run dev
```

Use the URL printed by the terminal. Configure required environment variables based on the repository's own documentation; do not invent OAuth credentials or expose secrets in frontend variables.

Verify that you can:
1. Open the frontend.
2. Log in, if authentication is configured.
3. View the student list.
4. Register a student.
5. Retrieve the student's details.
6. Update the student's details.
7. Use the grades functionality.

**Do not proceed until the application works locally, or until you have clearly documented which features require repair.**

---

## Phase 2 — Prepare AWS and control costs

### 2.1 Check credits and billing

Open [AWS Billing and Cost Management](https://console.aws.amazon.com/costmanagement/).

Review:
- Credits and expiration dates.
- Current charges.
- Free Tier eligibility.
- Cost and usage dashboards.
- Billing preferences and alert contacts.

Do not assume all database configurations, Multi-AZ deployments, or security services are free. Free Tier offerings depend on account plan, service, Region, and applicable limits. See the [AWS Free Tier documentation](https://docs.aws.amazon.com/us_en/awsaccountbilling/latest/aboutv2/free-tier.html).

### 2.2 Create an AWS Budget before deployment

Open [AWS Budgets](https://console.aws.amazon.com/costmanagement/home#/budgets).

1. Choose **Create budget**.
2. Select a cost budget.
3. Choose a monthly period.
4. Enter an amount you can afford.
5. Configure alerts, for example:
   - Actual spend at 50%.
   - Actual spend at 80%.
   - Actual spend at 100%.
   - Forecast spend at 100%.
6. Add an email address you monitor.
7. Create the budget.

Adjust thresholds to your budget and available credits. A budget notification is **not** automatically a spending cap; it alerts you but does not necessarily stop resources or prevent further charges. See [AWS Budgets pricing and details](https://aws.amazon.com/aws-cost-management/aws-budgets/pricing/).

### 2.3 Configure IAM security

Open [IAM](https://console.aws.amazon.com/iam/).

- Use an appropriately permissioned administrator identity for everyday work.
- Enable MFA for administrative access.
- Avoid using root credentials for routine operations.
- Avoid long-lived access keys unless necessary.
- Do not attach `AdministratorAccess` to the application instance.
- Create an EC2 role with only the permissions the application needs.
- Separate human administrator permissions from application permissions.

You may temporarily need elevated permissions to build infrastructure, but do not leave the running application with unrestricted administrator access.

---

## Phase 3 — Design the network

### 3.1 Create or inspect a VPC

Open [Amazon VPC](https://console.aws.amazon.com/vpc/).

Reuse an existing VPC only if its networking and security boundaries meet the requirements. Otherwise, create a VPC using an example CIDR such as:

```text
10.20.0.0/16
```

Check for overlap with existing networks before using this range.

### 3.2 Create subnets in two Availability Zones

Example layout:

| Subnet | Example CIDR | Purpose |
|---|---|---|
| Public subnet A | `10.20.1.0/24` | Load Balancer |
| Public subnet B | `10.20.2.0/24` | Load Balancer |
| Application subnet A | `10.20.11.0/24` | EC2 application |
| Database subnet A | `10.20.21.0/24` | RDS/Aurora |
| Database subnet B | `10.20.22.0/24` | RDS/Aurora subnet group |

Choose two different Availability Zones in Mumbai. These are illustrative CIDRs; ensure they fit inside your VPC and do not overlap.

- Public subnets need a route to an Internet Gateway.
- Database subnets should not have direct internet access.
- The RDS subnet group should use subnets in at least two Availability Zones.
- The application must reach databases over private networking.

A private application subnet is preferable for a more secure design but usually needs NAT or another outbound connectivity arrangement to download packages and container images. NAT Gateways can add significant cost. A simpler demonstration option is an EC2 instance in a public subnet whose security group accepts application traffic only from the Load Balancer. Keep RDS private.

### 3.3 Create security groups

| Security group | Inbound rules |
|---|---|
| `edutrack-alb-sg` | HTTP 80 from the internet; HTTPS 443 when configured |
| `edutrack-app-sg` | Application port only from `edutrack-alb-sg` |
| `edutrack-db-sg` | MySQL TCP 3306 only from `edutrack-app-sg` |

If MongoDB remains in use, restrict its port to the application components that need it.

Do **not** open ports 3306, 27017, or 9092 to `0.0.0.0/0`. Do not expose Kong's administrative interface publicly. Prefer Systems Manager Session Manager to opening SSH port 22.

---

## Phase 4 — Create Amazon RDS for student records

EduTrack's student service uses MySQL. Spring Data JPA can work with Amazon RDS for MySQL, so the application can retain its general structure while changing its database connection.

### 4.1 Create a DB subnet group

In [Amazon RDS](https://console.aws.amazon.com/rds/):

1. Choose **Subnet groups**.
2. Create `edutrack-db-subnets`.
3. Select your VPC.
4. Select the two private database subnets in different Availability Zones.
5. Create the subnet group.

### 4.2 Create the RDS MySQL database

Choose **Databases → Create database**. Select options similar to these, where available:

| Setting | Suggested choice |
|---|---|
| Creation method | Standard create |
| Engine | MySQL |
| Template | Dev/Test, if offered |
| DB identifier | `edutrack-mysql` |
| Credentials | Secrets Manager-managed credentials if available and suitable |
| Instance class | Small eligible class appropriate for testing |
| Storage | Small general-purpose SSD allocation |
| Availability | Single-AZ initially, if supported by the selected template |
| VPC | Project VPC |
| DB subnet group | `edutrack-db-subnets` |
| Public access | **No** |
| Security group | `edutrack-db-sg` |
| Encryption | Enabled |
| Automated backups | Enabled with a suitable short retention period |
| Deletion protection | Enable once ready if you can manage the additional deletion step later |

Choose a MySQL version compatible with the application's JDBC driver and configuration. Start small and review the price estimate before creating the database. AWS-managed RDS encryption can be used initially; a customer-managed KMS key can be demonstrated later if required.

Wait until the database is **Available**. Copy its endpoint from the database details. It resembles:

```text
edutrack-mysql.abcdefghijk.ap-south-1.rds.amazonaws.com
```

This is only an example. Do not add `https://` or a port to the endpoint field.

### 4.3 Connect Spring Boot to RDS

Inspect the actual configuration files:

```bash
cd ~/Documents/aws-projects/EduTrack

find backend-spring-boot -type f \
  \( -name 'application.properties' \
  -o -name 'application.yml' \
  -o -name 'application.yaml' \
  -o -name 'pom.xml' \) \
  -print
```

Find the current JDBC URL, username, password, and schema settings. The configuration may need to resemble:

```properties
spring.datasource.url=jdbc:mysql://${DB_HOST}:3306/edutrack
spring.datasource.username=${DB_USERNAME}
spring.datasource.password=${DB_PASSWORD}
```

This is an example, not a guaranteed drop-in replacement. Preserve any required JDBC options and match the repository's actual environment-variable conventions.

Store credentials in Secrets Manager or Systems Manager Parameter Store. Never commit real passwords to GitHub.

If Hibernate creates the schema automatically, verify its behavior before relying on it in production. Controlled schema migrations are preferable for a long-lived application.

### 4.4 Test connectivity and student CRUD

From an authorized environment that can reach the private database, you can test using the MySQL client:

```bash
mysql -h YOUR_RDS_ENDPOINT \
  -P 3306 \
  -u YOUR_DB_USERNAME \
  -p
```

Replace the placeholders with real values. The password is prompted interactively. Do not attempt to connect from an arbitrary public machine when the database is private.

Ensure the RDS security group allows MySQL traffic from the application security group. Start the Spring Boot service and inspect its logs.

Use the application or API to:
1. Register a student.
2. Retrieve the student by ID.
3. Update the department or email.
4. Retrieve the record again.
5. Confirm that the change persisted in RDS.

The schema and frontend form must include the required student ID, name, department, email, and academic fields. If the existing entity lacks fields, update the Java entity, schema, validation, and frontend accordingly.

---

## Phase 5 — Configure Multi-AZ, read replicas, and Aurora

### 5.1 Demonstrate RDS Multi-AZ

RDS Multi-AZ DB instance deployments maintain a synchronous standby in another Availability Zone and can automatically fail over when required. The standby is for availability, not ordinary read traffic. See [RDS Multi-AZ documentation](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZSingleStandby.html).

1. In RDS, select `edutrack-mysql`.
2. Choose **Modify**.
3. Find the availability or Multi-AZ setting.
4. Enable a Multi-AZ deployment.
5. Review the changes and cost estimate.
6. Apply the modification.
7. Wait for the change to complete.

The exact options depend on the engine, instance, and Region.

**Demonstration:**
1. Retrieve a student through the application.
2. Record the database status and endpoint.
3. Explain that RDS maintains a standby in another Availability Zone.
4. If practical, initiate a controlled failover using the supported RDS console action.
5. Monitor database status and application logs.
6. Retry student retrieval.
7. Explain that the application should reconnect after failover if it handles transient connection errors correctly.

Do not terminate the primary instance manually. One controlled failover, if the configuration permits it, is sufficient.

### 5.2 Demonstrate an RDS Read Replica

A read replica is intended to serve read traffic and help scale read-heavy workloads. Standard RDS read replicas generally replicate asynchronously, so replication lag is possible. See [RDS Read Replica documentation](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_ReadRepl.html).

1. Select the source database.
2. Open **Actions**.
3. Choose **Create read replica**, if supported.
4. Name it `edutrack-mysql-read`.
5. Select an eligible instance class and storage configuration.
6. Configure private networking and security groups.
7. Create the replica and wait until it is available.

Use the primary for writes and configure the application to direct suitable read queries to the replica. Creating a replica does not automatically redirect application queries.

Demonstrate replication by inserting a student into the primary and checking when it becomes visible on the replica. Explain that asynchronous replication does not guarantee immediate consistency.

### 5.3 Demonstrate Aurora separately

Aurora is a managed relational database engine compatible with MySQL and PostgreSQL. It has a different architecture from standard RDS MySQL.

For comparison, use **Aurora MySQL-Compatible**:

1. Open RDS and choose **Create database**.
2. Select Aurora MySQL-Compatible.
3. Choose a development-oriented template if available.
4. Use the identifier `edutrack-aurora-demo`.
5. Select the project VPC and private DB subnet group.
6. Disable public access.
7. Enable encryption.
8. Restrict access through the database security group.
9. Select the smallest suitable supported configuration and review its price.
10. Create the cluster and wait until available.

Available configurations and pricing vary; check the current [Aurora documentation](https://docs.aws.amazon.com/en_en/AmazonRDS/latest/AuroraUserGuide/USER_OnDemandDBInstances.html).

| Feature | Standard RDS for MySQL | Aurora MySQL-Compatible |
|---|---|---|
| Engine | MySQL | Aurora, compatible with MySQL |
| Storage architecture | RDS-managed database storage | Aurora distributed cluster storage |
| High availability | Multi-AZ options | Cluster-based architecture spanning Availability Zones |
| Read scaling | Supported read replicas | Aurora reader instances and endpoints |
| Application integration | MySQL driver | MySQL-compatible driver, subject to compatibility testing |
| Cost | Instance, storage, and deployment dependent | Cluster, compute, storage, and I/O dependent |

Compare architecture, failover, read scaling, and estimated costs in your report. You do not need to migrate the working application to Aurora; standard RDS can remain the application's primary database while Aurora is a separate comparison demonstration.

Delete the Aurora demonstration cluster when it is no longer required, after saving necessary evidence and data.

---

## Phase 6 — Add DynamoDB and DynamoDB Streams

The existing project uses MongoDB for grades. DynamoDB is not a drop-in replacement for MongoDB because their data models and query operations differ.

The least disruptive approach is to keep the existing grades service initially and use DynamoDB for a new feature: **student activity records and preferences**. This demonstrates SQL and NoSQL integration. If the assessment requires MongoDB to be removed entirely, the grades service must also be migrated.

### 6.1 Create the DynamoDB table

Open [Amazon DynamoDB](https://console.aws.amazon.com/dynamodb/).

1. Choose **Tables → Create table**.
2. Enter `EduTrackStudentActivity`.
3. Set partition key `studentId`, type `String`.
4. Set sort key `activityId`, type `String`.
5. Choose on-demand capacity if available and appropriate.
6. Enable encryption at rest.
7. Review optional backup/recovery settings.
8. Create the table.

Example item:

```json
{
  "studentId": "STU101",
  "activityId": "ACT001",
  "recordType": "ACTIVITY",
  "activityType": "PROFILE_UPDATED",
  "description": "Student email updated",
  "timestamp": "2026-10-17T12:00:00Z"
}
```

This is an illustrative data model. The composite key allows multiple activity items for one student.

### 6.2 Enable DynamoDB Streams

1. Open the table's **Exports and streams** or stream settings section.
2. Find **DynamoDB Streams**.
3. Enable the stream.
4. Choose **New and old images** to capture previous and updated item values.
5. Save the changes.

DynamoDB Streams captures item-level changes for downstream consumers. See the [DynamoDB Streams documentation](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Streams.html).

First demonstrate it manually:
1. Open **Explore table items**.
2. Insert a sample activity.
3. Update the item.
4. Delete the item.
5. Show the changes in the stream.

### 6.3 Integrate DynamoDB into the Node.js backend

From the backend directory:

```bash
cd ~/Documents/aws-projects/EduTrack/backend-node-js
npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
```

Example module:

```javascript
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");

const {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand
} = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({
  region: process.env.AWS_REGION
});

const dynamodb = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.DYNAMODB_TABLE;

async function saveActivity(item) {
  await dynamodb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: item
    })
  );
}

async function getActivity(studentId, activityId) {
  const result = await dynamodb.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { studentId, activityId }
    })
  );

  return result.Item;
}

module.exports = { saveActivity, getActivity };
```

This assumes the table has `studentId` as its partition key and `activityId` as its sort key. Adapt the code to the project's actual module system and coding style.

Set configuration values such as:

```text
AWS_REGION=ap-south-1
DYNAMODB_TABLE=EduTrackStudentActivity
```

These are examples, not credentials. Add API routes and call the module from the application; installing the SDK alone does not integrate the feature.

On EC2, use an IAM role to supply AWS credentials. Do not put access keys in the application configuration.

### 6.4 Trigger downstream processing with Lambda

Open [AWS Lambda](https://console.aws.amazon.com/lambda/).

1. Create `edutrack-activity-stream-handler`.
2. Choose a supported Node.js runtime.
3. Create or select an execution role.
4. Give the role permission to read the relevant DynamoDB stream and write application logs.
5. Create the function.
6. Choose **Add trigger** and select DynamoDB.
7. Select the `EduTrackStudentActivity` table and its stream.
8. Configure a suitable batch size and enable the trigger.

Example function:

```javascript
exports.handler = async (event) => {
  for (const record of event.Records || []) {
    console.log("Event:", record.eventName);

    const image =
      record.dynamodb?.NewImage ||
      record.dynamodb?.OldImage;

    console.log("Student:", image?.studentId);
  }
};
```

DynamoDB Stream images use DynamoDB's typed attribute format. Adapt the function if you need to process individual values or the full document.

**Demonstration:**
1. Insert an activity through the application.
2. Show the item in DynamoDB.
3. Inspect Lambda invocation metrics.
4. Open CloudWatch Logs and show the output.
5. Update the item and show that processing is triggered again.

```text
Application → DynamoDB item change → DynamoDB Stream
            → Lambda → CloudWatch Logs
```

---

## Phase 7 — Deploy EduTrack on EC2

### 7.1 Launch an EC2 instance

Open [Amazon EC2](https://console.aws.amazon.com/ec2/) and choose **Launch instance**.

| Setting | Recommendation |
|---|---|
| Name | `edutrack-server` |
| AMI | Ubuntu Server LTS |
| Instance type | Small instance suitable for the application, subject to testing |
| Key pair | Create/select one for recovery if needed; prefer Session Manager |
| VPC | Project VPC |
| Subnet | Application subnet |
| Public IP | Only if using the public-subnet approach |
| Security group | `edutrack-app-sg` |
| Storage | Reasonable root volume; expand if necessary |
| IAM instance profile | Application/SSM role |

EduTrack runs multiple containers, so the smallest instance may not have enough memory.

### 7.2 Create an EC2 IAM role

In IAM:
1. Create a role trusted by EC2.
2. Attach `AmazonSSMManagedInstanceCore` for Systems Manager access.
3. Add narrowly scoped permissions for the required DynamoDB table.
4. Add only the permissions needed to retrieve application secrets.
5. Attach the role through the EC2 instance profile.

Do not attach unrestricted administrator permissions.

### 7.3 Connect using Session Manager

Open [Systems Manager](https://console.aws.amazon.com/systems-manager/).

1. Open Fleet Manager or Session Manager.
2. Find the EC2 instance.
3. Start a session.

The instance must be configured as a managed node, with appropriate IAM permissions and connectivity to Systems Manager. See the [Session Manager documentation](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager.html).

If the instance does not appear, check its IAM role, SSM Agent, Region, and outbound connectivity.

### 7.4 Install Docker and clone the fork

Follow the [official Docker Engine installation instructions for Ubuntu](https://docs.docker.com/engine/install/ubuntu/). Verify:

```bash
docker --version
docker compose version
```

Clone the fork:

```bash
git clone https://github.com/YOUR_GITHUB_USERNAME/EduTrack.git
cd EduTrack
```

For a private repository, configure suitable GitHub authentication. Do not put a personal access token directly in a command that might be saved in shell history.

### 7.5 Configure production variables

Use the repository's environment-variable conventions and store sensitive values in Secrets Manager or Parameter Store.

Configure:
- Private RDS endpoint.
- DynamoDB table and Region.
- Any retained MongoDB service.
- Kafka broker and Kong routes.
- Frontend public URL.
- Required NextAuth/OAuth settings.

Do not blindly copy a local `.env` file to EC2; it may contain localhost URLs, development credentials, or invalid production settings.

### 7.6 Start the application

From the repository root:

```bash
docker compose config
docker compose up -d --build
docker compose ps
docker compose logs --tail=200
```

These commands start services defined in the Compose files. The frontend is not defined in the root Compose file described earlier; deploy it using the actual frontend production build configuration or add a suitable frontend service.

Verify:
- Spring Boot connects to RDS.
- The grades service starts.
- Kong routes requests correctly.
- The frontend can reach the backend.
- Student registration and retrieval work.
- DynamoDB activity records can be inserted and retrieved.

Only the intended web entry point should accept public traffic.

### 7.7 Configure an Application Load Balancer

To demonstrate WAF with a regional resource, use an Application Load Balancer.

1. Open EC2 → **Load Balancers**.
2. Choose **Create load balancer** → **Application Load Balancer**.
3. Make it internet-facing.
4. Select the VPC and two public subnets in different Availability Zones.
5. Attach `edutrack-alb-sg`.
6. Create a target group for the application server.
7. Register the EC2 instance.
8. Configure a health-check path that returns success.
9. Create an HTTP listener for initial testing.

After HTTP routing works, issue a certificate through AWS Certificate Manager and configure HTTPS. Redirect HTTP to HTTPS only after verifying HTTPS.

The Load Balancer must reach the application on its configured port. The EC2 security group should accept that traffic only from the Load Balancer security group.

Test the Load Balancer DNS name in a browser, then verify login, student registration/retrieval/update, DynamoDB activity, and Lambda stream processing.

---

## Phase 8 — Monitoring and auditing

### 8.1 CloudWatch

Open [CloudWatch](https://console.aws.amazon.com/cloudwatch/).

**EC2 metrics:** Metrics → All metrics → EC2. Inspect CPU utilization, network traffic, and instance status checks.

**RDS metrics:** Inspect CPU utilization, database connections, free storage, and read/write activity. Available metrics depend on engine and configuration.

**Application logs:** Configure the application to log to stdout/stderr. Use a suitable Docker log driver or the CloudWatch Agent to collect relevant logs. Create a CloudWatch log group.

**Create an alarm:**
1. Choose **Alarms → Create alarm**.
2. Select the EC2 CPU utilization metric.
3. Set a threshold and evaluation period appropriate to your test.
4. Select an SNS notification destination if email alerts are desired.
5. Create the alarm.

Generate legitimate test activity and confirm the alarm behaves as expected.

**Evidence:** EC2 metrics, RDS metrics, application logs, and alarm configuration.

### 8.2 CloudTrail

Open [CloudTrail](https://console.aws.amazon.com/cloudtrail/).

1. Choose **Create trail**.
2. Name it `edutrack-management-trail`.
3. Select an S3 bucket for logs.
4. Enable a multi-Region trail.
5. Log management events, including read and write events.
6. Create the trail.

CloudTrail Event history lets you inspect recent management events; a trail delivers ongoing logs to S3. See the [CloudTrail trail tutorial](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/tutorial-trail.html).

Demonstrate it by making a harmless change, such as changing a resource tag:
1. Open Event history.
2. Filter by event name or resource.
3. Open the event.
4. Identify event time, principal, action, and resource.
5. Show where trail logs are delivered.

Check current CloudTrail pricing before enabling extra event categories.

### 8.3 AWS Config

Open [AWS Config](https://console.aws.amazon.com/config/).

1. Start setup.
2. Select resource types to record.
3. Configure recording settings.
4. Select an S3 bucket for configuration history and snapshots.
5. Create the configuration recorder.
6. Enable recording.
7. Add suitable managed rules.

Consider rules for:
- RDS storage encryption.
- RDS public accessibility.
- Security groups that permit unrestricted SSH.
- DynamoDB point-in-time recovery, if enabled.

Verify rule availability and names in the current console.

AWS Config tracks supported resource configuration changes and evaluates compliance. It is not a replacement for CloudTrail: Config focuses on resource configuration state, while CloudTrail records API activity. See the [AWS Config getting-started guide](https://docs.aws.amazon.com/config/latest/developerguide/getting-started.html).

Demonstrate the resource inventory, configuration history, and compliance status. If you deliberately create a noncompliant configuration for demonstration, restore the secure configuration immediately afterward.

AWS Config can charge for recorded configuration items and rule evaluations; see [AWS Config pricing](https://aws.amazon.com/config/pricing/).

---

## Phase 9 — Security controls

### 9.1 Systems Manager Parameter Store

Open [Systems Manager Parameter Store](https://console.aws.amazon.com/systems-manager/parameters/).

Create parameters for non-secret configuration, such as:

```text
/edutrack/production/AWS_REGION
/edutrack/production/DYNAMODB_TABLE
/edutrack/production/DB_HOST
```

For credentials, use an appropriate secure parameter type or Secrets Manager. If using `SecureString`, select the appropriate KMS key. Give the EC2 role access only to the parameters it needs.

Never put secrets into public frontend variables or commit them to GitHub.

### 9.2 KMS

Open [AWS KMS](https://console.aws.amazon.com/kms/).

1. Choose **Create key**.
2. Select a symmetric encryption key.
3. Use an alias such as `alias/edutrack-project`.
4. Configure key administrators and permitted key users.
5. Review the key policy.
6. Create the key.
7. Use it for a supported resource, such as an encrypted Systems Manager parameter or a supported database configuration.

Changing encryption for an existing database may require a snapshot-and-restore or migration procedure rather than a simple toggle. KMS keys and related operations can incur charges; avoid unnecessary keys.

### 9.3 WAF

Because the architecture uses an Application Load Balancer, associate a regional WAF web ACL with it.

Open [AWS WAF](https://console.aws.amazon.com/wafv2/).

1. Create a web ACL in the Load Balancer's Region.
2. Select the Application Load Balancer as the protected resource.
3. Add a suitable AWS Managed Rules group.
4. Configure a default action.
5. Review rules and capacity requirements.
6. Associate the web ACL with the Load Balancer.

Initially monitor the effect of the rules before enabling restrictive blocking. See [AWS WAF resource documentation](https://docs.aws.amazon.com/waf/latest/developerguide/how-aws-waf-works-resources.html).

Demonstrate the web ACL, rules, sampled requests or metrics, and continued operation of legitimate student workflows. Do not perform attacks or load tests against public systems.

### 9.4 Shield

Shield Standard is automatically included with AWS services it protects; you do not need Shield Advanced merely to explain basic DDoS protection. See [AWS Shield](https://docs.aws.amazon.com/shield/).

Explain:
- Which public resources in your architecture are protected.
- How Shield differs from WAF.
- WAF filters HTTP requests, while Shield provides DDoS protection.

Do not enable Shield Advanced without reviewing its pricing and contractual requirements.

### 9.5 Shared Responsibility Model

**AWS is responsible for:**
- Physical data-center security.
- Physical hardware and underlying infrastructure.
- Security of managed-service infrastructure.
- Managed database infrastructure according to the selected service model.

**The customer is responsible for:**
- IAM identities, roles, and permissions.
- Application code and application-level authentication.
- Database access policies and network configuration.
- Credential and secret protection.
- Appropriate backup, encryption, and monitoring configuration.
- Application dependency security.
- Correct public-access and security-group configuration.

Responsibilities differ between EC2, RDS, Aurora, and other managed services.

---

## Phase 10 — Trusted Advisor and billing

### 10.1 Trusted Advisor

Open [AWS Trusted Advisor](https://console.aws.amazon.com/trustedadvisor/).

Review checks available to your account for:
- Cost optimization.
- Security.
- Fault tolerance.
- Performance.
- Service quotas.

Available checks depend on the account and support entitlements. Record each relevant recommendation, the resource concerned, why it matters, the suggested corrective action, and whether you applied it. You can demonstrate the service without applying every recommendation.

### 10.2 Cost Explorer

Open [AWS Cost Explorer](https://console.aws.amazon.com/costmanagement/).

1. Enable Cost Explorer if needed.
2. Open cost and usage reports.
3. Select a time period.
4. Group costs by service.
5. Identify costs associated with EC2, RDS, DynamoDB, CloudWatch, and other services.
6. Review credits and budget status.

Cost data may not appear immediately after resources are created. Review it throughout the project.

### 10.3 Free Tier

In Billing, inspect the Free Tier/usage information available to your account. Record eligible services, usage allowances, current usage, approaching limits, and credit expiration dates.

Free Tier offerings vary by account plan and service. See [AWS Free Tier tracking](https://docs.aws.amazon.com/us_en/awsaccountbilling/latest/aboutv2/tracking-free-tier-usage.html).

### 10.4 Verify budget alerts

Return to AWS Budgets and check:
- Monthly budget exists.
- Actual-spend thresholds are configured.
- Forecast threshold is configured.
- Notification email is correct.
- Budget status is visible.

Do not deliberately exceed the budget to demonstrate it. Show the configured threshold and explain how alerts work.

---

## Phase 11 — Push your changes to GitHub

When the application changes work locally and deployment configuration has been tested, commit to your fork:

```bash
cd ~/Documents/aws-projects/EduTrack

git status
git diff --stat
```

Before committing, ensure you are not including:
- Database passwords.
- AWS access keys.
- Production `.env` files.
- OAuth client secrets.
- Private certificates.
- SSH private keys.

Update `.gitignore` as appropriate, then:

```bash
git add .
git commit -m "Adapt EduTrack for AWS deployment"
git push -u origin aws-deployment
```

This pushes the branch to your own GitHub fork. Pushing source code to GitHub does **not** deploy it to AWS. The EC2 deployment is separate; source changes must be rebuilt and redeployed.

---

## Phase 12 — Final demonstration checklist

| No. | Demonstration | Evidence |
|---|---|---|
| 1 | AWS environment setup | VPC, subnets, security groups, EC2 |
| 2 | Student registration | Student record in app and RDS |
| 3 | Student retrieval | Retrieved student details |
| 4 | Student update | Updated record in RDS |
| 5 | DynamoDB integration | Activity record in DynamoDB |
| 6 | DynamoDB Streams | Stream configuration and captured changes |
| 7 | Downstream processing | Lambda invocation and CloudWatch Logs |
| 8 | RDS Multi-AZ | Deployment configuration and, if practical, controlled failover |
| 9 | RDS Read Replica | Replica status and replication demonstration |
| 10 | Aurora | Aurora configuration and comparison with standard RDS |
| 11 | CloudWatch | Metrics, application logs, and alarm |
| 12 | CloudTrail | Management events |
| 13 | AWS Config | Configuration history and compliance evaluation |
| 14 | Systems Manager | Session Manager and Parameter Store |
| 15 | KMS | Key configuration and use by a supported resource |
| 16 | WAF | Web ACL, rules, and request metrics |
| 17 | Shield | Explanation of applicable DDoS protection |
| 18 | Trusted Advisor | Available recommendations |
| 19 | Billing | Cost Explorer and Free Tier information |
| 20 | AWS Budgets | Monthly budget and alert thresholds |
| 21 | Security | IAM permissions, MFA, private DB access, protected credentials |

## Recommended initial architecture

- **EC2:** Runs EduTrack's application services.
- **Amazon RDS for MySQL:** Stores primary student records.
- **MongoDB:** Retained temporarily for the existing grades service unless you migrate it.
- **DynamoDB:** Stores supplementary student activity and preferences.
- **DynamoDB Streams and Lambda:** Demonstrate event-driven processing.
- **Aurora:** Separate comparison demonstration.
- **RDS Multi-AZ and read replicas:** Enabled in planned demonstration stages.
- **Application Load Balancer and WAF:** Public web entry point and request filtering.
- **CloudWatch, CloudTrail, AWS Config, Systems Manager, KMS, Trusted Advisor, and Budgets:** Management, monitoring, auditing, security, and cost demonstrations.

This preserves the existing application where practical while adding the AWS functionality required by the assignment.

## Cost and cleanup cautions

1. **Do not create every database configuration at once.** First run the application with standard RDS, then demonstrate Multi-AZ, read replicas, and Aurora in planned stages.
2. **Do not assume all services are free.** Multi-AZ databases, Aurora, read replicas, Load Balancers, WAF, NAT Gateways, and monitoring/configuration services can add charges. Check the [AWS Pricing Calculator](https://calculator.aws/) before creating resources. Review [RDS for MySQL pricing](https://aws.amazon.com/rds/mysql/pricing/).
3. **Delete demonstration resources when finished.** After saving evidence and required backups, check for unused database instances, Aurora clusters, read replicas, Load Balancers, NAT Gateways, and other billable resources.

## What to do first

Complete **Phase 1** first: fork EduTrack, inspect its configuration, and run the original application locally.

Because this is someone else's project, do not immediately replace database configurations or deploy the whole stack to EC2. First inspect the actual source files and determine the exact changes required for RDS and DynamoDB. This avoids guessing at configuration filenames, API routes, and database models.
