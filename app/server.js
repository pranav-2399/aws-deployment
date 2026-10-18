import express from 'express';
import mysql from 'mysql2/promise';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(here, 'public')));
const region = process.env.AWS_REGION || 'ap-south-1';
const table = process.env.DYNAMODB_TABLE || 'StudentLabActivity';
const sqlOpts = (host) => ({host, port: Number(process.env.DB_PORT || 3306), database: process.env.DB_NAME || 'student_lab', user: process.env.DB_USER, password: process.env.DB_PASSWORD, waitForConnections: true, connectionLimit: 3, queueLimit: 10, connectTimeout: 5000, ssl: {rejectUnauthorized: true, ...(process.env.DB_SSL_CA ? {ca: readFileSync(process.env.DB_SSL_CA, 'utf8')} : {})}});
const writer = process.env.DB_HOST ? mysql.createPool(sqlOpts(process.env.DB_HOST)) : null;
const reader = process.env.DB_READ_HOST ? mysql.createPool(sqlOpts(process.env.DB_READ_HOST)) : writer;
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({region}));
const valid = (s) => s && typeof s.student_id === 'string' && /^[A-Za-z0-9_-]{1,32}$/.test(s.student_id) && typeof s.full_name === 'string' && s.full_name.trim().length <= 120 && typeof s.department === 'string' && s.department.trim().length <= 80 && typeof s.email === 'string' && s.email.length <= 190 && typeof s.program === 'string' && s.program.trim().length <= 100 && Number.isInteger(Number(s.year_of_study)) && Number(s.year_of_study) >= 1 && Number(s.year_of_study) <= 8 && Number.isFinite(Number(s.gpa)) && Number(s.gpa) >= 0 && Number(s.gpa) <= 10;
async function audit(studentId, action, details = {}) {
  await dynamo.send(new PutCommand({TableName: table, Item: {student_id: studentId, occurred_at: new Date().toISOString(), action, details, source: 'student-dashboard'}}));
}
app.get('/api/health', async (_req, res) => {
  let sql = 'not-configured';
  try { 
    if (writer) { 
      await writer.query('SELECT 1'); sql = 'ok'; 
    } 
  } catch (e) { 
    console.error("Health checkup failed: " e.message)
    sql = 'error'; 
  }
  res.json({app: 'ok', sql, dynamodb: table, region});
});
app.get('/api/students', async (_req, res) => {
  if (!reader) return res.status(503).json({error: 'Set DB_HOST to enable SQL.'});
  try { const [rows] = await reader.query('SELECT student_id, full_name, department, email, program, year_of_study, gpa, created_at, updated_at FROM students ORDER BY full_name LIMIT 200'); res.json(rows); }
  catch (e) { console.error('student-list failed', e.message); res.status(503).json({error: 'SQL query failed. Check DB endpoint, schema, security group, and credentials.'}); }
});
app.get('/api/students/:id', async (req, res) => {
  if (!reader) return res.status(503).json({error: 'Set DB_HOST to enable SQL.'});
  try { const [rows] = await reader.execute('SELECT student_id, full_name, department, email, program, year_of_study, gpa, created_at, updated_at FROM students WHERE student_id=?', [req.params.id]); if (!rows.length) return res.status(404).json({error:'Student not found'}); res.json(rows[0]); }
  catch (e) { console.error('student-detail failed', e.message); res.status(503).json({error:'SQL query failed.'}); }
});
app.post('/api/students', async (req, res) => {
  if (!writer) return res.status(503).json({error:'Set DB_HOST to enable SQL.'});
  const s = req.body; if (!valid(s)) return res.status(400).json({error:'Provide ID, name, department, email, program, year (1–8) and GPA (0–10).'});
  try { await writer.execute('INSERT INTO students (student_id,full_name,department,email,program,year_of_study,gpa) VALUES (?,?,?,?,?,?,?)', [s.student_id.trim(),s.full_name.trim(),s.department.trim(),s.email.trim(),s.program.trim(),Number(s.year_of_study),Number(s.gpa)]); await audit(s.student_id, 'student.created', {department:s.department}); res.status(201).json({ok:true}); }
  catch (e) { console.error('student-create failed',e.message); res.status(e.code === 'ER_DUP_ENTRY' ? 409 : 503).json({error:e.code === 'ER_DUP_ENTRY' ? 'Student ID or email already exists.' : 'SQL insert or DynamoDB audit failed.'}); }
});
app.put('/api/students/:id', async (req, res) => {
  if (!writer) return res.status(503).json({error:'Set DB_HOST to enable SQL.'});
  const s = {...req.body, student_id:req.params.id}; if (!valid(s)) return res.status(400).json({error:'Provide valid student fields.'});
  try { const [result] = await writer.execute('UPDATE students SET full_name=?,department=?,email=?,program=?,year_of_study=?,gpa=? WHERE student_id=?', [s.full_name.trim(),s.department.trim(),s.email.trim(),s.program.trim(),Number(s.year_of_study),Number(s.gpa),req.params.id]); if (!result.affectedRows) return res.status(404).json({error:'Student not found'}); await audit(req.params.id,'student.updated',{department:s.department}); res.json({ok:true}); }
  catch (e) { console.error('student-update failed',e.message); res.status(e.code === 'ER_DUP_ENTRY' ? 409 : 503).json({error:e.code === 'ER_DUP_ENTRY' ? 'Email already exists.' : 'SQL update or DynamoDB audit failed.'}); }
});
app.get('/api/students/:id/activity', async (req,res) => {
  try { const out = await dynamo.send(new QueryCommand({TableName:table,KeyConditionExpression:'student_id = :id',ExpressionAttributeValues:{':id':req.params.id},ScanIndexForward:false,Limit:30})); res.json(out.Items || []); }
  catch (e) { console.error('activity-query failed',e.message); res.status(503).json({error:'DynamoDB query failed. Check table key schema and IAM.'}); }
});
app.get('/api/demo', async (_req,res) => { try { res.json(JSON.parse(await readFile(path.join(here,'../db/demo.json'),'utf8'))); } catch { res.status(500).json({error:'Demo content unavailable'}); } });
app.use((err,_req,res,_next) => { console.error('request failed',err.message); res.status(400).json({error:'Invalid request.'}); });
const port = Number(process.env.PORT || 3000);
app.listen(port,'0.0.0.0',()=>console.log(`Student lab listening on ${port}`));
