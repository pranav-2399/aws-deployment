import Fastify from "fastify";
import { connectDB } from "./db.js";
import gradeRoutes from "./routes/grades.js";
import { seedGrades } from "./utils/seed.js";
import { deleteGradesConsumer } from "./kafka/consumers.js";

// Initialization
const fastify = Fastify({
  logger: {
    transport: { target: "pino-pretty", options: {} },
    serializers: {
      req(request) {
        return {
          method: request.method,
          url: `${request.protocol}://${request.hostname}${request.url}`,
        };
      },
      res(response) {
        return {
          statusCode: response.statusCode,
          method: response.request.method,
          url: `${response.request.protocol}://${response.request.hostname}${response.request.url}`,
        };
      },
    },
  },
  genReqId() {
    return undefined;
  },
  ignoreTrailingSlash: true,
  caseSensitive: false,
  ignoreDuplicateSlashes: true,
});

// Routes
fastify.get("/", async (request, reply) => {
  reply.send({ hello: "world" });
});

fastify.register(gradeRoutes, { prefix: "/api/grades" });

fastify.post("/api/grades/seed/:count", async (request, reply) => {
  const count = request.params.count;
  await seedGrades(count);
  reply.send({ message: `Seeded ${count} grades` });
});

// Start server
const port = process.env.PORT || 3000;
const start = async () => {
  try {
    // Wait until MongoDB is available before accepting API requests.
    await connectDB();
    const host = await fastify.listen({ port, host: "0.0.0.0" });
    console.log(`Server is running at ${host}`);
    // Consumers
    await deleteGradesConsumer();
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
