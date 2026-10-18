# AWS deployment and demonstration runbook

This is a guided lab, not a one-click production deployment. Pick one AWS Region (examples below use `ap-south-1`) and tag every resource `Project=StudentLab`. AWS console names and eligibility change; verify prices and current free-tier terms in your account before creating resources. Do not use real student personal data.

## 0. Understand the cost shape first

**Low-cost baseline:** one EC2 `t3.micro`, one small Single-AZ RDS MySQL DB instance, one DynamoDB on-demand table, SSM Parameter Store SecureString, and default CloudWatch logs/metrics. Even this is not guaranteed free: region, account age, storage, public IPv4, snapshots, and data transfer matter. Set a monthly AWS Budget before launching anything.

**Optional demonstrations have incremental cost:** RDS Multi-AZ standby, read replica, Aurora cluster/Serverless capacity and storage/I/O, ALB or CloudFront plus WAF, AWS Config recording and evaluations, CloudWatch log ingestion/retention, and Lambda invocations. Avoid running multiple database variants together. Create one, demonstrate it, save screenshots/notes, then delete it before trying the next. Check the billing console after each stage.

## 1. Budget and account guardrails

1. In **Billing and Cost Management → Budgets → Create budget**, choose a **monthly cost budget**, set a low amount suitable for your account, and add alerts at (for example) 50%, 80%, and 100% actual spend; add a forecast alert if offered.
2. Send alerts to an email address you control. Confirm the subscription from the email. A budget alert notifies; it does not automatically stop resources.
3. In **Billing → Free Tier** (or the current Free Tier / credits view), inspect eligible usage and remaining allowances. Eligibility varies by account creation date, offer, region, and service. Do not assume RDS or Aurora experiments are free.
4. Enable MFA on the root user, do not create root access keys, and use an IAM Identity Center or IAM admin identity for daily work. Keep the lab in one Region.
5. Add cost allocation tags if you want cost explorer grouping: `Project=StudentLab`, `Owner=your-name`, `Expiry=YYYY-MM-DD`.

## 2. Create SQL database (baseline RDS MySQL)

1. Open **RDS → Databases → Create database**. Choose **Standard create**, **MySQL**, a currently available engine version, and **Free tier** only if the console confirms that your account and chosen options qualify; otherwise use a small burstable class and note the charge.
2. Set identifier `student-lab-mysql`, a unique master username/password, and **do not** use the master login from the app. Store the master secret in Secrets Manager or a local password manager; do not put it in Git.
3. Select a small instance class; for the baseline select **Single-AZ** and disable optional performance insights/extended retention features unless you explicitly need them.
4. Choose a VPC and DB subnet group spanning at least two AZs (required for later Multi-AZ experiments). Set **Public access: No**. Use a DB security group allowing TCP 3306 only from the app security group.
5. Enable storage encryption with the default AWS managed KMS key for the baseline. Set a short backup retention suitable for the lab (understand backup storage charges). Create DB.
6. Copy the endpoint and port. The app security group must be able to reach the DB security group; never open 3306 to `0.0.0.0/0`.
7. In **RDS → Query Editor** if available, or connect through an SSM-managed EC2 session/tunnel, create a separate app login and database. For example:

```sql
CREATE DATABASE student_lab;
CREATE USER 'student_app'@'%' IDENTIFIED BY 'use-a-unique-long-password';
GRANT SELECT, INSERT, UPDATE ON student_lab.* TO 'student_app'@'%';
```

The wildcard host is bounded by the DB security group; tighter host patterns are preferable when practical. Use a secrets mechanism for the password.

## 3. Create DynamoDB table and enable Streams

1. Open **DynamoDB → Tables → Create table**. Name it `StudentLabActivity`, partition key `student_id` (String), sort key `occurred_at` (String). Choose **On-demand** capacity so idle lab time has no provisioned RCU/WCU allocation.
2. Enable server-side encryption (AWS owned or AWS managed key). TTL is not needed for this small demo; you can add an optional `expires_at` TTL later if you add lifecycle cleanup.
3. Open the table's **Exports and streams / DynamoDB Streams** settings and enable a stream with **New and old images**. Note the stream ARN and view the stream records in the console after a student update.
4. Optional downstream step: create a small Lambda function with a handler that logs the event name and `dynamodb.Keys.student_id`; grant it `dynamodb:DescribeStream`, `GetRecords`, `GetShardIterator`, and `ListStreams` scoped to the stream ARN, and configure an event source mapping from the stream. Keep batch size low (e.g. 5), enable retries, and inspect Lambda CloudWatch logs. Remove the mapping/function after the demonstration. Streams capture item changes; the Lambda event source mapping polls and invokes the function, so the downstream work is asynchronous and may be retried.

## 4. Launch the small app on EC2

1. Create an EC2 security group for the app. Permit TCP 3000 only from your current IP for a short classroom demo. For a shared/public app, put an ALB in front and allow 3000 only from the ALB security group. Never publish the database endpoint.
2. Launch one Amazon Linux 2023 EC2 `t3.micro` in a public subnet for the short demo, with auto-assigned public IP, app SG, and an IAM instance profile. Prefer **no inbound SSH** and connect using Systems Manager Session Manager. Confirm the instance has the SSM agent and outbound access to SSM endpoints (NAT or VPC endpoints if private).
3. The EC2 instance role needs the app policy in `../infra/iam-app-policy.json`, with `REGION` and `ACCOUNT_ID` replaced. Attach it to the instance profile. Add only SSM read permission for the exact parameter ARNs if using Parameter Store. Do not grant `dynamodb:*` or put static access keys on EC2.
4. Install Node.js 22 from Amazon Linux repositories or the supported NodeSource instructions for Amazon Linux 2023. Copy this project to the instance (Git checkout or SCP), then install production dependencies with `npm install --omit=dev --no-audit --no-fund`.
5. In **Systems Manager → Parameter Store**, create SecureString values for `/student-lab/DB_PASSWORD` and (optionally) non-secret DB settings. Restrict the role to those parameter ARNs and KMS decrypt for the selected key if using a customer-managed key. For this starter app, export environment variables in a root-owned systemd EnvironmentFile or a systemd drop-in; do not commit the values. Set `AWS_REGION`, `DYNAMODB_TABLE`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, and optionally `DB_READ_HOST`. Keep TLS certificate verification enabled; if needed, install the official AWS RDS CA bundle on the instance and set `DB_SSL_CA` to its path.
6. From an SSM shell, run `mysql -h <endpoint> -u student_app -p student_lab < db/schema.sql`, then start with `node app/server.js`. For repeatable operation, configure a small `systemd` unit with `Restart=on-failure`, `User=studentlab`, and the environment file readable only by that service user. The app listens on port 3000.
7. Open `http://<EC2-public-ip>:3000` from the allowed client IP. Use `/api/health` to see app and SQL status. If the UI says SQL unavailable, inspect the app logs, DB SG source, endpoint, TLS setting, and IAM role/DynamoDB table name.
8. Add a CloudWatch Agent only if you need OS memory/disk metrics; EC2 basic metrics don't include all OS-level measurements. Keep log retention short (e.g. 7 days) and avoid logging credentials or student data.

### Optional Docker deployment

Docker is not required for this project. The Dockerfile builds one small Node image and includes no UI images/database images. Build with `docker build -t student-lab .`; run it with a protected environment file and the EC2 instance role attached. Do not bake `.env` or AWS keys into the image. Native Node + systemd has lower overhead on a 1 GiB `t3.micro` and is the recommended path here.

## 5. Insert, retrieve, update, and inspect sample data

1. In the dashboard click **Register student** and add a fictional record. Use IDs such as `STU-1001`; use synthetic email addresses.
2. Confirm the student appears in the table. Select the row to query activity from DynamoDB.
3. Click **Edit**, change department/GPA, and save. The updated SQL row and a `student.updated` item should appear.
4. Inspect DynamoDB table items and confirm the compound key `student_id` + `occurred_at`.
5. Inspect **DynamoDB → Exports and streams / Stream view** and find INSERT/MODIFY records. If Lambda is configured, inspect its CloudWatch log group.
6. Use SQL `SELECT * FROM students;` through Query Editor/SSM and DynamoDB's item explorer to compare each store.

## 6. RDS Multi-AZ, read replicas, and Aurora comparison

Do this as separate experiments on a disposable database after taking a snapshot and checking current price.

### RDS Multi-AZ

1. In **RDS → Modify** for the baseline DB choose **Multi-AZ deployment** (a conventional DB instance deployment with one standby) and apply immediately only if you accept a short maintenance/failover event.
2. Wait until status is Available and confirm Multi-AZ in the DB details. The standby is for automatic failover and **does not serve reads**.
3. Demonstrate failover only in a planned window using **Actions → Reboot → Reboot with failover**. Observe the app reconnect and note outage duration, RDS events, and CloudWatch metrics. The app reconnects on new requests; it does not implement a sophisticated retry queue.
4. Return to Single-AZ after the demo if cost control matters.

### Read replica

1. For supported RDS engines/versions, create a read replica from the source DB and place it in the same Region for a straightforward demo. Wait until Available and copy its endpoint.
2. Add `DB_READ_HOST=<replica endpoint>` to the app environment and restart. `GET /api/students` and detail reads use the replica; POST/PUT always use the writer endpoint.
3. Update a row, then refresh the dashboard. Observe replication lag before the replica catches up. Do not use a read replica for read-after-write consistency-sensitive flows.
4. Remove `DB_READ_HOST`, restart, then delete the replica after recording results. Replica support/limitations differ by engine and version; verify the console option.

### Aurora

1. Treat Aurora as a separate replacement experiment, not an extra database the app needs. Create **Amazon Aurora MySQL-Compatible** in RDS; for a short idle lab compare a small Aurora Serverless v2 configuration where supported, noting ACU minimum, pause/resume availability, storage/I/O, and regional support before creation.
2. Place the cluster in private subnets; choose encryption and credentials; note cluster writer and reader endpoints. Add the app SG as the only inbound DB source.
3. Load `db/schema.sql`, set `DB_HOST` to the cluster writer endpoint and optionally `DB_READ_HOST` to the reader endpoint. Demonstrate CRUD and read routing.
4. Compare engine compatibility, cluster storage/replica behavior, failover, throughput, and the bill with RDS MySQL. Aurora has a different cluster/storage and pricing model; it is not automatically cheaper for a small, mostly idle student lab. Delete cluster instances and cluster after the experiment, preserving only a final snapshot if needed.

## 7. Monitoring, auditing, configuration, and management

### CloudWatch

- **RDS → Monitoring**: inspect CPUUtilization, DatabaseConnections, FreeStorageSpace, read/write IOPS and (where available) replica lag. Use a small alarm such as CPU > 80% for 5 minutes only as an exercise; SNS notifications may add charges.
- **EC2 → Monitoring**: inspect CPU/network/status checks. Install CloudWatch Agent for memory/disk; use a short log retention period for `/student-lab/app` logs.
- Create an alarm from **CloudWatch → Alarms → Create alarm**, select the metric and a threshold, then optionally notify an SNS topic/email. Delete the alarm/topic after the exercise if not needed.

### CloudTrail

- Open **CloudTrail → Event history**, filter recent events by `Event source` (`rds.amazonaws.com`, `dynamodb.amazonaws.com`, `ec2.amazonaws.com`, or `ssm.amazonaws.com`) and inspect actions such as `CreateDBInstance`, `ModifyDBInstance`, and `PutParameter`. Event History provides recent management events; create a trail to S3 only if you need longer retention, and account for S3/storage/data costs.
- Use CloudTrail to identify who made an administrative API call. It is not a database SQL query audit log; for SQL auditing evaluate engine-specific audit logging separately.

### AWS Config

- Open **AWS Config → Get started**. Select only resource types needed for this short lab (RDS, DynamoDB, EC2 security groups, and IAM role if useful), choose a recorder role and delivery bucket, and use daily recording where appropriate. Recording items/rule evaluations can be billable; check pricing first and stop the recorder/delete unneeded rules when done.
- Add a few managed rules relevant to resources present, such as encrypted RDS storage, restricted incoming SSH, or DynamoDB table encryption. Review resource timeline, rule compliance, and remediation guidance. Config evaluates recorded supported configuration; it does not observe application SQL/data changes.

### Systems Manager

- **Session Manager**: verify the EC2 instance has an attached role with `AmazonSSMManagedInstanceCore`, is managed/online, and can reach SSM endpoints. Start a browser session with no inbound SSH rule.
- **Parameter Store**: store settings under `/student-lab/`, use SecureString for secrets, scope IAM access to specific parameter ARNs, and avoid printing secrets in shell history/logs. Rotate/delete lab parameters when finished.

### Trusted Advisor

Open **Trusted Advisor** in the console and review available Security, Fault Tolerance, Performance, Service Limits, and Cost Optimization checks. Available check depth depends on account/support plan. Record recommendations and applicability; do not blindly apply changes to unrelated resources.

## 8. Security, WAF, Shield, and shared responsibility

- **Shared responsibility:** AWS secures facilities, hardware, foundational networking, and managed service infrastructure. The customer secures IAM, credentials, VPC/security group rules, encryption choices, backups/retention, OS patches and app runtime on EC2, application validation/authorization, data handling, and cost controls. For RDS/Aurora, AWS manages the host/engine infrastructure; the customer still manages database users, grants, network reachability, and data.
- **KMS:** RDS storage is encrypted at rest with KMS; DynamoDB has server-side encryption. Use AWS managed keys for a minimal demo; use a customer-managed KMS key only to demonstrate key policy, grants, rotation options, and CloudTrail events, understanding KMS request/key charges. Changing keys later can require migration/restore steps.
- **WAF:** WAF is attached to supported web entry points such as CloudFront or an Application Load Balancer, not directly to an EC2 instance. For a real public demo, create an ALB or CloudFront entry point, associate a regional/global web ACL as appropriate, start with AWS managed common rule group in Count mode, inspect sampled requests, then enable Block after checking false positives. Add a rate-based rule with a conservative request threshold. ALB/CloudFront and WAF have ongoing charges; avoid leaving them running for this resource-constrained lab.
- **Shield:** Shield Standard is automatically included for supported AWS edge/network services at no extra charge; explain this baseline protection. Shield Advanced is a separate paid commitment and is out of scope for this budget lab. WAF supplies configurable application-layer filtering; Shield does not replace secure app design.
- **IAM/MFA:** use an instance role for application DynamoDB permissions; use named admin identity with MFA for console changes; never embed long-lived credentials, grant wildcard permissions, or expose database ingress to the internet. Rotate/delete lab credentials.

## 9. Cost review and teardown

1. Review **Billing → Cost Explorer** (enable it if prompted) by service, Region, and `Project` tag. Cost data can take time to appear. Compare RDS, EC2, DynamoDB, Config, CloudWatch, and data transfer before/after optional experiments.
2. Review **Billing → Bills** and current Free Tier usage/credits. A Free Tier allowance is not a guaranteed zero bill; check actual service usage and overages.
3. Stop/terminate EC2; delete RDS DB/replicas/Aurora instances and cluster; choose whether to retain a final snapshot (snapshots continue to use storage); delete unused DynamoDB table after keeping needed evidence; disable/delete Lambda mapping/function; stop Config recorder and delete unnecessary rules/delivery bucket; delete CloudWatch alarms/log groups/SNS; remove WAF/ALB/CloudFront resources and Parameter Store secrets; verify Cost Explorer/Bills later for residual resources.

## Expected demonstration sequence

1. Show the architecture and budget alert setup.
2. Register a fictional student; show SQL row plus DynamoDB activity item.
3. Retrieve and edit the record in the dashboard; show the corresponding activity event.
4. Show DynamoDB Stream INSERT/MODIFY records and optional Lambda processing log.
5. Explain RDS Single-AZ baseline, then demonstrate Multi-AZ failover and separately read replica routing.
6. Repeat with Aurora and compare its endpoints, reader behavior, and spend.
7. Review CloudWatch metrics/logs, CloudTrail management event, Config timeline/rules, Session Manager and Parameter Store.
8. Review Trusted Advisor, Cost Explorer, Free Tier/credits, budget alert, then teardown.
