# Student AWS Database Lab

A small student-management dashboard for learning AWS database and operations features. It uses one Node.js API process, a static HTML/CSS/JS dashboard, an RDS MySQL-compatible database for structured student records, and DynamoDB for activity events. There are no frontend build tools, bundled images, Kafka, MongoDB, or local database containers.

## Architecture

```text
Browser ──HTTP──> EC2 t3.micro (Node.js + Express, 1 process)
                         ├──TLS/3306──> RDS MySQL or Aurora MySQL (private subnet)
                         │                └─ optional DB_READ_HOST for SELECT queries
                         └──AWS SDK──> DynamoDB table (student_id + occurred_at)
                                            └─ optional DynamoDB Stream → Lambda
```

The relational database is the source of truth. DynamoDB stores append-only student activity items. Student create/update writes SQL first and then writes one DynamoDB activity event. This is intentionally a teaching example rather than a distributed transaction: if the SQL change succeeds and the audit write fails, the API reports an error even though the student row may already be committed. Check SQL and DynamoDB separately when demonstrating partial failures.

## Features

- Register, retrieve, list, and update a student in SQL.
- Record each successful create/update as a DynamoDB item; list activity by student.
- Optional read endpoint (`DB_READ_HOST`) for read-heavy queries; writes stay on the primary.
- Health endpoint at `/api/health` and a compact dashboard at `/`.
- AWS SDK credential chain: use an EC2 instance profile in AWS; never bake keys into the image.
- Three-connection SQL pool, small request-body limit, no user-uploaded media, and no background worker.

## Quick local development

Requires Node.js 20+ and reachable MySQL plus DynamoDB (AWS table or DynamoDB Local if you already have it). No database container is included.

```sh
cp .env.example .env
# edit .env with SQL connection and AWS region/table
npm install
mysql -h "$DB_HOST" -u "$DB_USER" -p "$DB_NAME" < db/schema.sql
npm start
```

Open `http://localhost:3000`. For a local-only UI preview without AWS resources, health/SQL status will show unavailable. Never commit `.env`.

## AWS deployment

Follow [the deployment and demonstration runbook](docs/AWS-DEPLOYMENT.md). Start with a single-AZ, small RDS MySQL instance and on-demand DynamoDB. Enable one optional feature at a time, record what you observed, then delete the extra resources. Multi-AZ, Aurora, read replicas, WAF/ALB/CloudFront, AWS Config, CloudWatch retention, and data transfer can add cost.

## Project layout

```text
aws-student-lab/
├── app/
│   ├── server.js              # Express API, SQL access, DynamoDB activity writes/queries
│   └── public/                # static dashboard (no image assets)
├── db/
│   ├── schema.sql             # relational student schema
│   └── demo.json              # short in-dashboard AWS service explanations
├── docs/AWS-DEPLOYMENT.md     # end-to-end console workflow and demonstration script
├── infra/iam-app-policy.json  # example app role policy; replace resource ARNs
├── .env.example
├── Dockerfile
└── package.json
```

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | App and SQL connectivity |
| GET | `/api/students` | List up to 200; read endpoint if configured |
| GET | `/api/students/:id` | Retrieve detail |
| POST | `/api/students` | Insert student; append `student.created` activity |
| PUT | `/api/students/:id` | Update student; append `student.updated` activity |
| GET | `/api/students/:id/activity` | Query DynamoDB partition for latest events |

Expected student JSON: `student_id`, `full_name`, `department`, `email`, `program`, `year_of_study` (1–8), and `gpa` (0–10).
