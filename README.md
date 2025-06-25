<div align="center">
  <br />
  <h1 align="center">🎓 EduTrack</h1>
  <p align="center">
    A full-stack student management system built on a distributed, event-driven microservices architecture for the "Software Architecture" module.
  </p>
  <br />
</div>

<div align="center">
  <!-- Status Badge -->
  <img alt="Status" src="https://img.shields.io/badge/Status-Completed-blue"/>
  <!-- Tech Badges -->
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white"/>
  <img alt="Spring Boot" src="https://img.shields.io/badge/Spring_Boot-6DB33F?style=for-the-badge&logo=springboot&logoColor=white"/>
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-5FA04E?style=for-the-badge&logo=nodedotjs&logoColor=white"/>
  <img alt="Kafka" src="https://img.shields.io/badge/Apache_Kafka-231F20?style=for-the-badge&logo=apachekafka&logoColor=white"/>
  <img alt="Docker" src="https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white"/>
</div>

---

### **📌 Table of Contents**
* [✨ Core Features](#-core-features)
* [🧰 Technology Stack](#-technology-stack)
* [🏗️ Architecture & Screenshots](#️-architecture--screenshots)
* [📨 Get In Touch](#-get-in-touch)

---

### **✨ Core Features**

| Feature Area                  | Description                                                                                                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 🏛️ **Microservices Architecture** | The system is decoupled into independent services: a **Spring Boot/Java** backend for managing students and a **Node.js/Fastify** backend for handling grades.              |
| 📨 **Event-Driven Communication**| Services communicate asynchronously using **Apache Kafka**. For example, deleting a student publishes an event that the grades service consumes to delete associated grades. |
| 🐘 **Polyglot Persistence**      | Utilizes the best database for each service's needs: **MySQL** for the relational student data and **MongoDB** for the flexible, document-based grade data.                   |
| 🚪 **Centralized API Gateway**    | A **Kong API Gateway** acts as a single entry point, routing requests to the appropriate backend service and simplifying client-side logic.                                     |
| 🐳 **Containerized Deployment**   | The entire multi-service application, including databases and Kafka, is fully containerized with **Docker** and orchestrated using a single `docker-compose` file.          |
| 💻 **Modern Frontend**          | A sleek and functional user interface built with **Next.js**, **Shadcn/ui**, and a powerful, reusable **TanStack Table** component for data display and interaction.             |
| 🔒 **Secure Authentication**    | Robust user authentication handled by the frontend using **NextAuth**, with options for both standard credentials and **Google OAuth**.                                        |

---

### **🧰 Technology Stack**

This project demonstrates a polyglot, distributed system using a wide range of modern technologies.

| Category                      | Technologies & Services                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Frontend**                  | <img src="https://skillicons.dev/icons?i=nextjs" alt="Next.js" width="24" style="vertical-align: middle; margin-right: 5px;"> **Next.js** with <img src="https://skillicons.dev/icons?i=ts" alt="TypeScript" width="24" style="vertical-align: middle; margin-right: 5px;"> **TypeScript** and <img src="https://avatars.githubusercontent.com/u/139895814?s=200&v=4" alt="Shadcn/ui" width="24" style="vertical-align: middle; margin-right: 5px;"> **Shadcn/ui**. |
| **Student Service (Java)**      | <img src="https://skillicons.dev/icons?i=spring" alt="Spring Boot" width="24" style="vertical-align: middle; margin-right: 5px;"> **Spring Boot** with **Spring Data JPA** for managing student data.                                                                                                                                                                                                                    |
| **Grades Service (Node.js)**    | <img src="https://skillicons.dev/icons?i=nodejs" alt="Node.js" width="24" style="vertical-align: middle; margin-right: 5px;"> **Node.js** with the <img src="https://www.fastify.io/images/fastify-logo-black.png" alt="Fastify" width="24" style="vertical-align: middle; margin-right: 5px;"> **Fastify** framework and **Mongoose** for managing grade data.                                                                  |
| **Messaging & Events**        | <img src="https://skillicons.dev/icons?i=kafka" alt="Apache Kafka" width="24" style="vertical-align: middle; margin-right: 5px;"> **Apache Kafka** for asynchronous, event-driven communication between backend services.                                                                                                                                                                                                  |
| **API Gateway**               | <img src="https://skillicons.dev/icons?i=kong" alt="Kong" width="24" style="vertical-align: middle; margin-right: 5px;"> **Kong API Gateway** to provide a unified entry point and route traffic to the appropriate microservice.                                                                                                                                                                                        |
| **Databases**                 | <img src="https://skillicons.dev/icons?i=mysql" alt="MySQL" width="24" style="vertical-align: middle; margin-right: 5px;"> **MySQL** for relational student data and <img src="https://skillicons.dev/icons?i=mongodb" alt="MongoDB" width="24" style="vertical-align: middle; margin-right: 5px;"> **MongoDB** for document-based grade storage.                                                                                  |
| **Containerization**          | <img src="https://skillicons.dev/icons?i=docker" alt="Docker" width="24" style="vertical-align: middle; margin-right: 5px;"> **Docker** & **Docker Compose** to containerize and orchestrate all components of the system for easy setup and deployment.                                                                                                                                                                     |

---

### **🏗️ Architecture & Screenshots**

The project is built on a microservices architecture where two separate backends handle distinct domains (Students and Grades). They communicate asynchronously via a Kafka message broker, and all traffic is routed through a Kong API Gateway.

*(An architecture diagram would be ideal here to visually represent the system flow.)*

<p align="center">
  <img src="https://raw.githubusercontent.com/Zawalid/edutrack/main/screenshots/architecture.png" alt="EduTrack System Architecture" width="85%">
  <br>
  <em>High-level architecture of the EduTrack system.</em>
</p>
<br>
<p align="center">
  <img src="https://github.com/user-attachments/assets/142eda45-39fe-4a0c-bb6c-ca659d0ab822" alt="EduTrack Frontend Dashboard" width="85%">
  <br>
  <em>The main dashboard displaying the student data table with actions for managing students and grades.</em>
</p>
<br>
<p align="center">
  <img src="https://github.com/user-attachments/assets/ce1f5e11-090d-4947-a061-e9784311b121" alt="Insert Grades Modal" width="85%">
  <br>
  <em>The modal interface for searching students by class and inserting their grades.</em>
</p>

---

### **📨 Get In Touch**

Let's connect! I'm always open to discussing new projects, creative ideas, or opportunities to be part of an amazing team.

**Walid Zakan**

-   **📧 Email**: [walid.zakan@gmail.com](mailto:walid.zakan@gmail.com)
-   **💼 LinkedIn**: [linkedin.com/in/walid-zakan](https://www.linkedin.com/in/walid-zakan)
