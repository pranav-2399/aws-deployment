
# EduTrack: AWS Deployment and Demonstration Guide

This guide explains how to adapt the existing [EduTrack repository](https://github.com/Zawalid/EduTrack) for an AWS project that demonstrates relational and NoSQL databases, availability, monitoring, security, and cost management.

> **Important:** EduTrack is someone else's project. Inspect its configuration and adapt it incrementally. A full local-stack run is optional; you may proceed directly to AWS after identifying the code changes and configuration required. The commands and configurations below are examples; confirm service names, versions, environment variables, and routes against the actual repository before using them.

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

## Expected end-to-end workflow

Follow these steps in order. The phase references point to the detailed instructions below. Review the repository in Phase 1, then follow the AWS sequence. A full local application run is optional; the application can be tested after deployment or one service at a time.

1. **Prepare AWS and control spending.** Choose the Region, inspect billing and credits, create a monthly budget and alerts, configure MFA and IAM, and prepare the VPC and security groups (Phases 2–3).
2. **Create the baseline databases.** Create a private, encrypted RDS MySQL database for student records, then create the DynamoDB activity table and enable Streams (Phases 4–5). Start with the baseline configuration; add Multi-AZ, replicas, and Aurora later.
3. **Adapt the application.** Configure Spring Boot to use RDS, add the DynamoDB activity integration, and set the Node/EC2 role permissions. Keep MongoDB for grades unless you have time to migrate that service (Phases 4–5 and 7).
4. **Prepare the deployable source.** Review changes and secrets, then commit and push the branch so the EC2 instance can obtain the application (Phase 6).
5. **Deploy the application.** Launch/configure EC2, use Systems Manager Session Manager, deploy the services, and put an Application Load Balancer in front of the web entry point (Phase 7).
6. **Demonstrate application data operations.** Register/insert a sample student in RDS, retrieve it, update it, and verify the persisted value. Insert and retrieve a supplementary activity record in DynamoDB (Phases 4–5 and 7).
7. **Demonstrate DynamoDB Streams.** Update or delete an activity item, show the stream record, then show the Lambda invocation and CloudWatch log output (Phase 5).
8. **Explain relational availability and scaling.** Show RDS Multi-AZ, read replicas where supported, and Aurora; explain each design and compare expected cost (Phase 8).
9. **Review operations and controls.** Show CloudWatch metrics/logs/alarms, CloudTrail API activity, AWS Config history, Session Manager, IAM, KMS, WAF, Shield, and the Shared Responsibility Model (Phases 9–10).
10. **Close with cost and architecture evidence.** Review Trusted Advisor recommendations, Cost Explorer, Free Tier/account billing, the budget thresholds, architecture, database choices, security measures, and cleanup plan (Phase 11 and the final checklist).

**Do not create Multi-AZ, read replicas, or Aurora until the baseline RDS application path works**, unless the assignment specifically requires them earlier. They are separate demonstration stages and can add charges.

---

## Phase 1 — Prepare the repository (a full local run is optional)

### 1.1 Fork and clone the repository

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

### 1.2 Inspect the codebase

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

Before choosing the final AWS database layout, record these repository-specific dependencies:
- Spring Boot stores student records in MySQL.
- The grades service currently uses MongoDB; keep it for the first deployment unless you plan a separate migration to DynamoDB.
- The frontend's Prisma schema currently uses PostgreSQL for Auth.js user/account records. This is a separate workload from student records. RDS MySQL cannot serve this PostgreSQL schema unchanged. Decide whether to provision a separate PostgreSQL database or adapt and validate the Prisma schema/provider for a supported database. Do not reuse Kong's internal PostgreSQL database for application data.
- The root Compose file does not include the frontend. Before deployment, either add a production-ready frontend service/container or document how it will be deployed separately and routed through the load balancer.

These are implementation decisions, not reasons to block AWS account setup or database provisioning.

### 1.3 Optional: run the original application locally

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

**This local run is optional.** If it fails because AWS-only configuration, OAuth credentials, or a service is unavailable, record the blocker and continue with the AWS workflow. Test each service after it is connected to its AWS dependencies.

---

## Phase 2 — Set AWS region, access, and cost guardrails

### 2.1 Choose an AWS Region

Use **Asia Pacific (Mumbai), `ap-south-1`**, unless your existing resources or credits require another region.

1. Sign in to the [AWS Management Console](https://console.aws.amazon.com/).
2. Open the Region selector.
3. Select **Asia Pacific (Mumbai)**.
4. Keep EC2, RDS, DynamoDB, CloudWatch, Systems Manager, and other regional resources in the same Region.

**CloudFront exception:** If you protect the site through CloudFront, its associated WAF resources are configured in **US East (N. Virginia), `us-east-1`**, because CloudFront is global. See the [AWS WAF resource documentation](https://docs.aws.amazon.com/waf/latest/developerguide/how-aws-waf-works-resources.html).

### 2.2 Check credits and billing

Open [AWS Billing and Cost Management](https://console.aws.amazon.com/costmanagement/).

Review:
- Credits and expiration dates.
- Current charges.
- Free Tier eligibility.
- Cost and usage dashboards.
- Billing preferences and alert contacts.

Do not assume all database configurations, Multi-AZ deployments, or security services are free. Free Tier offerings depend on account plan, service, Region, and applicable limits. See the [AWS Free Tier documentation](https://docs.aws.amazon.com/us_en/awsaccountbilling/latest/aboutv2/free-tier.html).

### 2.3 Create an AWS Budget before deployment

Open [AWS Budgets](https://console.aws.amazon.com/costmanagement/home#/budgets).

1. Select **Create budget**.
2. Choose **Customize (advanced)** if the first screen offers it, then choose **Cost budget** and select **Next**.
3. Enter **Budget name** `edutrack-monthly-cost-limit`; set **Period** to **Monthly**, **Budget renewal** to **Recurring**, and **Budgeting method** to **Fixed**.
4. Enter your own affordable monthly amount in **Enter your budgeted amount**. Do not copy a sample amount without checking prices for your selected Region and services.
5. Leave filters unselected if you want to see all account costs; otherwise, choose **Add filter → Region** and select `Asia Pacific (Mumbai)` only if you deliberately want a Mumbai-only budget.
6. Select **Next**. Under **Add an alert threshold**, create these alerts one at a time: **Actual cost**, threshold `50`, **% of budget**; repeat with `80` and `100`. Add another alert with **Forecasted cost**, threshold `100`, **% of budget**.
7. For each alert, enter the email address to notify in **Email recipients**. Select **Next**, review the summary and thresholds, then select **Create budget**.
8. Open the created budget and confirm its status and alert thresholds. Open each notification email and follow AWS's verification link; an unverified address does not receive budget notifications. Check spam/junk mail if the verification message is missing.

Adjust thresholds to your budget and available credits. A budget notification is **not** automatically a spending cap; it alerts you but does not necessarily stop resources or prevent further charges. See [AWS Budgets pricing and details](https://aws.amazon.com/aws-cost-management/aws-budgets/pricing/).

### 2.4 Configure IAM security

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

### 3.1 Create the VPC and subnets in the console

Use this concrete layout for the walkthrough. The EC2 instance runs in one public subnet so it can download Docker images without a NAT Gateway; its security group only permits application traffic from the Load Balancer. RDS remains in private subnets. This keeps the first demonstration less expensive while still isolating the database.

Before creating anything, use the console's Region selector to confirm **Asia Pacific (Mumbai), `ap-south-1`**. In the steps below, choose any two different Availability Zones shown in your account. AWS accounts can map Availability Zone letters differently, so the important requirement is that the two selected zones are distinct.

1. Open [Amazon VPC](https://console.aws.amazon.com/vpc/) and select **VPC dashboard → Create VPC**.
2. For **Resources to create**, select **VPC only**.
3. Enter **Name tag auto-generation**: `edutrack-vpc`.
4. Set **IPv4 CIDR block** to `10.20.0.0/16`; leave IPv6 disabled for this exercise; leave tenancy as **Default**.
5. Select **Create VPC**. Open the created VPC and record its VPC ID.
6. In the left navigation, select **Subnets → Create subnet**.
7. For **VPC ID**, select `edutrack-vpc`.
8. Add these four subnet rows. For each row, enter the **Subnet name**, choose one of the two distinct Availability Zones, and enter the IPv4 CIDR shown:

   | Subnet name | Availability Zone | IPv4 subnet CIDR block | Purpose |
   |---|---|---|---|
   | `edutrack-public-a` | First selected zone | `10.20.1.0/24` | ALB and EC2 application |
   | `edutrack-public-b` | Second selected zone | `10.20.2.0/24` | ALB |
   | `edutrack-db-private-a` | First selected zone | `10.20.21.0/24` | RDS subnet group |
   | `edutrack-db-private-b` | Second selected zone | `10.20.22.0/24` | RDS subnet group |

9. Select **Create subnet**. Open `edutrack-public-a`; choose **Actions → Edit subnet settings**, check **Enable auto-assign public IPv4 address**, and select **Save**. Repeat for `edutrack-public-b`. Leave auto-assign public IPv4 disabled on both database subnets.

The CIDRs above fit inside `10.20.0.0/16`. If that range overlaps a network you already use, choose a different non-overlapping VPC CIDR and change every subnet CIDR consistently.

### 3.2 Create and attach an Internet Gateway

An Internet Gateway attaches to the **VPC**, not to an individual subnet. The public subnet receives internet routing through its route table.

1. In VPC left navigation, choose **Internet gateways → Create internet gateway**.
2. Enter **Name tag** `edutrack-igw`, then select **Create internet gateway**.
3. Select the new `edutrack-igw`; choose **Actions → Attach to a VPC**.
4. In **Available VPCs**, select `edutrack-vpc`; choose **Attach internet gateway**.
5. In left navigation, choose **Route tables → Create route table**.
6. Enter **Name** `edutrack-public-rt`; for **VPC**, select `edutrack-vpc`; choose **Create route table**.
7. Select `edutrack-public-rt`, open **Routes → Edit routes → Add route**.
8. Set **Destination** to `0.0.0.0/0`. Set **Target** to **Internet Gateway**, then select `edutrack-igw`. Choose **Save changes**.
9. With `edutrack-public-rt` selected, open **Subnet associations → Edit subnet associations**. Check only `edutrack-public-a` and `edutrack-public-b`; choose **Save associations**.
10. Open **Route tables**, select `edutrack-public-rt`, then open **Subnet associations**. Confirm only the two public subnets are associated with it. Next select the route table whose **Main** column is **Yes** for `edutrack-vpc`, then open **Routes** and confirm it has `10.20.0.0/16 → local` and no `0.0.0.0/0` route. Subnets that are not explicitly associated with another route table use this main table automatically, so leave both database subnets unassociated with `edutrack-public-rt`. If either database subnet is associated with the public table, use that table's **Subnet associations → Edit subnet associations**, uncheck the database subnet, and save; it will then use the main table.

The main route table gives database subnets VPC-local communication, while the separate public route table sends internet-bound IPv4 traffic through the attached gateway. AWS's console workflow is documented in [Create a VPC](https://docs.aws.amazon.com/vpc/latest/userguide/create-vpc.html), [Create a subnet](https://docs.aws.amazon.com/vpc/latest/userguide/create-subnets.html), and [Internet gateways](https://docs.aws.amazon.com/vpc/latest/userguide/working-with-igw.html).

### 3.3 Create the three security groups

In VPC left navigation, choose **Security groups → Create security group**. For each group, enter its name and description, select `edutrack-vpc` for **VPC**, add the listed inbound rules, leave outbound rules at the default **All traffic → 0.0.0.0/0**, and choose **Create security group**. Use the security-group picker as the source when a rule names another security group; do not type a public IP range for those rules.

Create these groups:

| Group name | Inbound rules to add |
|---|---|
| `edutrack-alb-sg` | **HTTP**, TCP 80, source **Anywhere-IPv4** (`0.0.0.0/0`) for initial testing. Add **HTTPS**, TCP 443, same source only after configuring the certificate/listener. |
| `edutrack-app-sg` | **Custom TCP**, port `3000`, source security group `edutrack-alb-sg` (Next.js frontend target). If your ALB target is Kong instead, use its configured proxy port, normally `8000`, and make that same port the target group's port. |
| `edutrack-db-sg` | **MySQL/Aurora**, TCP 3306, source security group `edutrack-app-sg`. Add a separate PostgreSQL TCP 5432 rule from `edutrack-app-sg` only if you deploy the frontend's separate Prisma/Auth database in this VPC. |

If the ALB fronts the Next.js frontend on port 3000 and that frontend calls Kong privately, do not add a public inbound rule for Kong's proxy/admin ports. Docker containers on the same Compose network should use service names and container ports. Do **not** open 3306, 5432, 27017, 9092, or Kong's admin ports to `0.0.0.0/0`. Do not add SSH port 22; use Systems Manager Session Manager in Phase 7.

---

## Phase 4 — Create the primary RDS database for student records

EduTrack's student service uses MySQL. Spring Data JPA can work with Amazon RDS for MySQL, so the application can retain its general structure while changing its database connection.

### 4.1 Create a DB subnet group

In [Amazon RDS](https://console.aws.amazon.com/rds/):

1. In the left navigation, choose **Subnet groups → Create DB subnet group**.
2. Enter **Name** `edutrack-db-subnets` and **Description** `Private subnets for EduTrack databases`.
3. For **VPC**, select `edutrack-vpc`.
4. Under **Add subnets**, select the two Availability Zones used in Phase 3.
5. In **Subnets**, select `edutrack-db-private-a` and `edutrack-db-private-b`; verify their CIDRs are `10.20.21.0/24` and `10.20.22.0/24`.
6. Choose **Create**. Confirm the new subnet group lists both zones before proceeding.

### 4.2 Create the RDS MySQL database

In RDS, choose **Databases → Create database**. Select **Standard create**, then use these values on the database creation form. Some labels move as AWS updates the console; use the named section and field, and leave unspecified advanced settings at their defaults.

| Setting | Suggested choice |
|---|---|
| Creation method | Standard create |
| Engine | MySQL |
| Template | **Free tier** only if the console confirms eligibility and the chosen options fit its allowance; otherwise **Dev/Test** |
| DB identifier | `edutrack-mysql` |
| Credentials | Under **Settings**, enter master username `edutrackadmin`; select **Manage master credentials in AWS Secrets Manager** if available. If not, choose self-managed credentials and create a strong unique password; save it securely and never commit it. |
| DB instance class | Under **Instance configuration**, choose a burstable class marked eligible for your account/Region, such as `db.t3.micro` if offered. |
| Storage | General Purpose SSD (`gp3` if offered); enter `20` GiB; leave storage autoscaling off for this short demo unless required. |
| Availability | **Single-AZ DB instance deployment** for initial testing. |
| VPC | Under **Connectivity**, choose `edutrack-vpc`. |
| DB subnet group | `edutrack-db-subnets` |
| Public access | **No** |
| VPC security group | Choose **Choose existing**, remove any default group if selected, then select `edutrack-db-sg`. |
| Encryption | Under **Additional configuration**, keep **Enable encryption** checked; default AWS owned key is acceptable for the baseline. |
| Initial database name | Under **Additional configuration**, enter `edutrack` if the application expects that schema; check the Spring config first. |
| Automated backups | Keep automated backups enabled; use a short retention such as `1` day for a temporary test database. |
| Deletion protection | Leave off for a temporary demonstration database; enable it before retaining valuable data. |

Under **Engine options**, select a MySQL version compatible with the application's JDBC driver. On the final review, confirm **Public access: No**, the DB subnet group, security group, 20 GiB storage, and displayed monthly estimate. Select **Create database** only after checking the account's cost limits.

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

### 4.4 Resolve the frontend authentication database

The frontend's Prisma schema uses PostgreSQL for its Auth.js adapter. Decide how to host that database before enabling Google sign-in in the deployed app:

1. Provision a separate private PostgreSQL database, or adapt the Prisma datasource and migrations to use a database supported by your chosen design.
2. Keep the application auth tables separate from Kong's database. Do not point Prisma at Kong's internal database.
3. Configure `DATABASE_URL` and `DIRECT_DATABASE_URL` for the selected database. Store production values in Parameter Store or Secrets Manager, not in Git.
4. Apply the Prisma migrations from a host that can reach the private database, then verify that a test sign-in creates the expected user/account records.

This extra database is a current-code dependency and may add cost. If you change the Prisma provider, validate the schema and migrations before relying on that choice.

### 4.5 Verify RDS connectivity and student CRUD after deployment

Complete this verification after Phase 7 deploys the application. If you are testing only the Spring Boot service earlier, use an authorized environment that can reach the private database. For a manual database check, use the MySQL client:

```bash
mysql -h YOUR_RDS_ENDPOINT \
  -P 3306 \
  -u YOUR_DB_USERNAME \
  -p
```

Replace the placeholders with real values. The password is prompted interactively. Do not attempt to connect from an arbitrary public machine when the database is private.

Ensure the RDS security group allows MySQL traffic from the application security group. Start the Spring Boot service and inspect its logs. In the normal workflow, this happens on EC2 in Phase 7.

Use the application or API to:
1. Register a student.
2. Retrieve the student by ID.
3. Update the department or email.
4. Retrieve the record again.
5. Confirm that the change persisted in RDS.

The schema and frontend form must include the required student ID, name, department, email, and academic fields. If the existing entity lacks fields, update the Java entity, schema, validation, and frontend accordingly.

---

## Phase 5 — Add DynamoDB and DynamoDB Streams

The existing project uses MongoDB for grades. DynamoDB is not a drop-in replacement for MongoDB because their data models and query operations differ.

The least disruptive approach is to keep the existing grades service initially and use DynamoDB for a new feature: **student activity records and preferences**. This demonstrates SQL and NoSQL integration. If the assessment requires MongoDB to be removed entirely, the grades service must also be migrated.

### 5.1 Create the DynamoDB table

Open [Amazon DynamoDB](https://console.aws.amazon.com/dynamodb/).

1. Confirm the Region selector shows `ap-south-1`; choose **Tables → Create table**.
2. Under **Table details**, enter **Table name** `EduTrackStudentActivity`.
3. Under **Partition key**, enter `studentId` and select type **String**.
4. Check **Add sort key**; enter `activityId` and select type **String**.
5. Under **Table settings**, choose **Customize settings** if shown. Set **Table class** to **DynamoDB Standard** and **Read/write capacity settings** to **On-demand**. Leave secondary indexes empty for this demo.
6. Under **Encryption at rest**, leave encryption enabled with the default AWS owned key for the baseline. Add a customer-managed KMS key only after completing Phase 10.2.
7. Leave deletion protection off for a temporary test table unless you are keeping valuable data. Select **Create table**.
8. Open the table details and wait for **Status: Active** before inserting records.

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

### 5.2 Enable DynamoDB Streams

1. In the DynamoDB console, select **Tables → EduTrackStudentActivity**.
2. Open the **Exports and streams** tab and scroll to **DynamoDB stream details**.
3. Select **Turn on** (or **Enable**) next to DynamoDB stream.
4. In **View type**, select **New and old images**.
5. Select **Turn on stream** and confirm the stream status changes to enabled. Copy the stream ARN for the Lambda setup.

DynamoDB Streams captures item-level changes for downstream consumers. See the [DynamoDB Streams documentation](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Streams.html).

First demonstrate the table mutations manually. DynamoDB Streams is a change feed; use the Lambda consumer in 5.4 and its CloudWatch logs to display the actual stream event payload.
1. Open the table and select **Explore table items → Create item**.
2. In the item editor, use **JSON view** and enter the sample item shown above; choose **Create item**.
3. Select the item, choose **Edit item**, change `description`, and save the change.
4. Select the item and choose **Delete item** only after confirming this is disposable demo data.
5. After the Lambda trigger is configured in 5.4, use a new test item for each operation and inspect the Lambda log event to point out `INSERT`, `MODIFY`, and `REMOVE` record types. The DynamoDB console's **Explore table items** view shows current table items, not a historical stream-event browser.

### 5.3 Integrate DynamoDB into the Node.js backend

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

### 5.4 Trigger downstream processing with Lambda

Open [AWS Lambda](https://console.aws.amazon.com/lambda/).

1. Select **Functions → Create function → Author from scratch**.
2. Enter **Function name** `edutrack-activity-stream-handler`; choose a currently supported **Node.js** runtime and **Architecture** `x86_64`.
3. Under **Permissions**, choose **Create a new role with basic Lambda permissions**, then select **Create function**.
4. Open **Configuration → Permissions**, select the execution role name to open it in IAM, then choose **Add permissions → Attach policies**. Attach `AWSLambdaDynamoDBExecutionRole` (grants stream read and CloudWatch Logs permissions), then return to the Lambda function.
5. Open the **Code** tab, replace the starter code with the example below, and select **Deploy**.
6. In **Function overview**, choose **Add trigger**. Select **DynamoDB** as the source.
7. In **DynamoDB table**, choose `EduTrackStudentActivity`. Select the enabled stream whose view type is **New and old images**.
8. Set **Batch size** to `10`, leave **Starting position** as **Latest**, check **Enable trigger**, then choose **Add**.
9. Open **Configuration → Triggers** and verify the trigger is enabled. The first event created before enabling a `LATEST` trigger may not be processed; create a fresh test item afterward.

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

## Phase 6 — Review, commit, and push the application changes

After reviewing the application and AWS configuration changes, commit to your fork. A complete local-stack run is optional; do not commit until targeted changes are reviewed:

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

## Phase 7 — Deploy EduTrack on EC2

### 7.1 Launch an EC2 instance

Open [Amazon EC2](https://console.aws.amazon.com/ec2/) in `ap-south-1`, then choose **Instances → Launch instances**. Use these form values:

1. Under **Name and tags**, enter `edutrack-server`.
2. Under **Application and OS Images**, select **Ubuntu Server 24.04 LTS** (64-bit x86) or the current Ubuntu LTS AMI shown in your Region.
3. Under **Instance type**, select a burstable type available to your account. Start with at least 2 vCPU/4 GiB RAM if your containers fit; check the price and free-tier eligibility before selecting it.
4. Under **Key pair (login)**, choose **Proceed without a key pair** because the plan uses Session Manager. Create/download a key pair only if you have a documented recovery need and can store the private key securely.
5. Expand **Network settings → Edit**. Set **VPC** to `edutrack-vpc`, **Subnet** to `edutrack-public-a`, **Auto-assign public IP** to **Enable**, and **Firewall (security groups)** to **Select existing security group**. Select only `edutrack-app-sg`.
6. Under **Configure storage**, keep the AMI root volume or set it to `30` GiB General Purpose SSD if the console allows it and the cost is acceptable. Docker images/logs consume disk space.
7. Expand **Advanced details**. For **IAM instance profile**, select the EC2 role created in 7.2. Leave user data blank for this manual walkthrough.
8. Review the summary and select **Launch instance**. Open the instance details and wait for **Instance state: Running** and both status checks to pass.

This demo places EC2 in a public subnet to avoid a NAT Gateway charge. Its security group still blocks direct web traffic; only the ALB security group can reach the application port. Do not add an SSH inbound rule. Multiple containers need memory, so a smaller instance may need services disabled or a larger paid instance.

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

For this repository, inspect and set the actual variable names used by the code. The frontend currently expects `STUDENTS_URL`, `GRADES_URL`, `AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `DATABASE_URL`, and `DIRECT_DATABASE_URL`. Its backend API URLs must match the deployment topology. When the frontend and APIs share the Docker network, the service URLs are typically `http://spring-app:8080/api/students` and `http://nodejs-app:3001/api/grades`; from a process running directly on the EC2 host, use the host-published ports instead. Keep the Prisma auth database URLs private and consistent with the provider decision in Phase 4.4.

Do not blindly copy a local `.env` file to EC2; it may contain localhost URLs, development credentials, or invalid production settings.

### 7.6 Start the application

From the repository root:

```bash
docker compose config
docker compose up -d --build
docker compose ps
docker compose logs --tail=200
```

These commands start services defined in the Compose files. The frontend is not defined in the root Compose file. Complete the frontend deployment decision in Phase 1 before this step: either build and run it as a production container on EC2, or deploy it separately and configure its backend URLs and public URL. Route the browser-facing entry point through the load balancer; keep database ports private.

Verify:
- Spring Boot connects to RDS.
- The grades service starts.
- Kong routes requests correctly.
- The frontend can reach the backend.
- Student registration and retrieval work.
- DynamoDB activity records can be inserted and retrieved.

Only the intended web entry point should accept public traffic.

### 7.7 Configure an Application Load Balancer

In the EC2 console, choose **Load Balancing → Target Groups → Create target group**:

1. Choose **Instances** as the target type; enter target group name `edutrack-web-tg`.
2. Set **Protocol** `HTTP`, **Port** `3000` (the Next.js container's published/listening port), and **VPC** `edutrack-vpc`.
3. Under **Health checks**, use protocol `HTTP` and path `/`. If the frontend's `/` does not return a success status, use a known healthy path from the application.
4. Choose **Next**, select `edutrack-server`, keep port `3000`, choose **Include as pending below**, then choose **Create target group**.

Now choose **Load Balancers → Create load balancer → Application Load Balancer → Create**:

1. Enter **Load balancer name** `edutrack-alb`; choose **Scheme: Internet-facing** and **IP address type: IPv4**.
2. Under **Network mapping**, choose **VPC** `edutrack-vpc`; select the two public subnets `edutrack-public-a` and `edutrack-public-b` (one in each selected Availability Zone).
3. Under **Security groups**, select `edutrack-alb-sg` and remove the default security group if the console added it.
4. Under **Listeners and routing**, keep listener **HTTP:80** and set its **Default action** to **Forward to `edutrack-web-tg`**.
5. Review the summary and select **Create load balancer**. Wait until its state is **Active**.
6. Open **Target Groups → edutrack-web-tg → Targets**. Wait for the registered EC2 target to become **Healthy**. If it is unhealthy, check that the frontend is running/listening on port 3000, that `edutrack-app-sg` allows TCP 3000 from `edutrack-alb-sg`, and that the health-check path returns HTTP success.

If the EC2 deployment serves Kong directly rather than Next.js, use the Kong proxy port configured in Compose (typically 8000) in both target group and app security group. Do not use Kong's admin port. The root Compose file currently does not include the frontend, so add/deploy the frontend before expecting a port-3000 target to become healthy.

After HTTP routing works, issue a certificate through AWS Certificate Manager and configure HTTPS. Redirect HTTP to HTTPS only after verifying HTTPS.

The Load Balancer must reach the application on its configured port. The EC2 security group should accept that traffic only from the Load Balancer security group.

Test the Load Balancer DNS name in a browser, then verify login, student registration/retrieval/update, DynamoDB activity, and Lambda stream processing.

---

## Phase 8 — Demonstrate Multi-AZ, read replicas, and Aurora

### 8.1 Demonstrate RDS Multi-AZ

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

### 8.2 Demonstrate an RDS Read Replica

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

### 8.3 Demonstrate Aurora separately

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

## Phase 9 — Review monitoring, auditing, and configuration history

### 9.1 CloudWatch

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

### 9.2 CloudTrail

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

### 9.3 AWS Config

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

## Phase 10 — Demonstrate Systems Manager and security controls

### 10.1 Systems Manager Parameter Store

Open [Systems Manager Parameter Store](https://console.aws.amazon.com/systems-manager/parameters/).

Create parameters for non-secret configuration, such as:

```text
/edutrack/production/AWS_REGION
/edutrack/production/DYNAMODB_TABLE
/edutrack/production/DB_HOST
```

For credentials, use an appropriate secure parameter type or Secrets Manager. If using `SecureString`, select the appropriate KMS key. Give the EC2 role access only to the parameters it needs.

Never put secrets into public frontend variables or commit them to GitHub.

### 10.2 KMS

Open [AWS KMS](https://console.aws.amazon.com/kms/).

1. Choose **Create key**.
2. Select a symmetric encryption key.
3. Use an alias such as `alias/edutrack-project`.
4. Configure key administrators and permitted key users.
5. Review the key policy.
6. Create the key.
7. Use it for a supported resource, such as an encrypted Systems Manager parameter or a supported database configuration.

Changing encryption for an existing database may require a snapshot-and-restore or migration procedure rather than a simple toggle. KMS keys and related operations can incur charges; avoid unnecessary keys.

### 10.3 WAF

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

### 10.4 Shield

Shield Standard is automatically included with AWS services it protects; you do not need Shield Advanced merely to explain basic DDoS protection. See [AWS Shield](https://docs.aws.amazon.com/shield/).

Explain:
- Which public resources in your architecture are protected.
- How Shield differs from WAF.
- WAF filters HTTP requests, while Shield provides DDoS protection.

Do not enable Shield Advanced without reviewing its pricing and contractual requirements.

### 10.5 Shared Responsibility Model

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

## Phase 11 — Review Trusted Advisor, billing, and cost information

### 11.1 Trusted Advisor

Open [AWS Trusted Advisor](https://console.aws.amazon.com/trustedadvisor/).

Review checks available to your account for:
- Cost optimization.
- Security.
- Fault tolerance.
- Performance.
- Service quotas.

Available checks depend on the account and support entitlements. Record each relevant recommendation, the resource concerned, why it matters, the suggested corrective action, and whether you applied it. You can demonstrate the service without applying every recommendation.

### 11.2 Cost Explorer

Open [AWS Cost Explorer](https://console.aws.amazon.com/costmanagement/).

1. Enable Cost Explorer if needed.
2. Open cost and usage reports.
3. Select a time period.
4. Group costs by service.
5. Identify costs associated with EC2, RDS, DynamoDB, CloudWatch, and other services.
6. Review credits and budget status.

Cost data may not appear immediately after resources are created. Review it throughout the project.

### 11.3 Free Tier

In Billing, inspect the Free Tier/usage information available to your account. Record eligible services, usage allowances, current usage, approaching limits, and credit expiration dates.

Free Tier offerings vary by account plan and service. See [AWS Free Tier tracking](https://docs.aws.amazon.com/us_en/awsaccountbilling/latest/aboutv2/tracking-free-tier-usage.html).

### 11.4 Verify budget alerts

Return to AWS Budgets and check:
- Monthly budget exists.
- Actual-spend thresholds are configured.
- Forecast threshold is configured.
- Notification email is correct.
- Budget status is visible.

Do not deliberately exceed the budget to demonstrate it. Show the configured threshold and explain how alerts work.

---

## Phase 12 — Prepare the final demonstration

| Step | Demonstration | Evidence |
|---|---|---|
| 1 | AWS environment and database resources | Region, VPC, subnets, security groups, baseline RDS and DynamoDB table |
| 2 | Sample data insertion | Student record in RDS and activity item in DynamoDB |
| 3 | Student CRUD | Registration/insertion, retrieval, update, and confirmation that the updated values persisted |
| 4 | DynamoDB Streams | Stream view after an item change, Lambda invocation, and CloudWatch log output |
| 5 | Availability and scaling | RDS Multi-AZ configuration/failover explanation, read replica behavior, and Aurora comparison |
| 6 | Monitoring and audit | CloudWatch metrics/logs/alarm, CloudTrail API event, and AWS Config history/compliance |
| 7 | Operations and security | Session Manager, IAM least privilege/MFA, KMS, WAF, Shield explanation, and shared responsibilities |
| 8 | Trusted Advisor and cost review | Recommendations available to the account, Cost Explorer, Free Tier/account billing details |
| 9 | Budget | Monthly amount, actual/forecast alert thresholds, and notification configuration |
| 10 | Architecture and cleanup summary | Architecture diagram, database choices, security controls, cost plan, and resources to stop/delete |

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

Start with **Phase 2**: select the Region, review account billing and credits, create a monthly budget with alerts, and confirm your IAM/MFA setup. Prepare the repository in Phase 1 when you are ready to inspect or change the application. Then follow the **Expected end-to-end workflow** above. Inspect the code and configuration as you prepare the AWS integration, but you do not need to get the complete application running locally before provisioning AWS resources.
