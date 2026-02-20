WhatsApp Automation System

A Node.js-based WhatsApp automation system built using whatsapp-web.js and Puppeteer.
Supports on-premise deployment with session persistence and human-behavior simulation.

1. Overview

  This system creates and manages WhatsApp Web sessions programmatically using a headless browser (Puppeteer).

  It allows:

    Multiple WhatsApp account sessions

    Automatic message handling

    Media storage

    Human-like reply simulation

    On-premise deployment

    Database logging of messages and files

  ⚠️ This is NOT an official WhatsApp Business API integration.


2. Architecture
   
  User Phone
      ↓
  WhatsApp Servers
      ↓
  Headless WhatsApp Web (Puppeteer)
      ↓
  Node.js Application
      ↓
  MySQL Database


  Each WhatsApp number runs in an isolated session.

3. Requirements

  Server Requirements

  Recommended (5–10 accounts):

  CPU: 4 cores

  RAM: 8 GB

  SSD: 50 GB

  OS: Ubuntu 22.04 LTS (recommended)

  For 10–15 accounts:

  8 cores

  16 GB RAM

  Software Requirements

  Node.js v18+

  MySQL

  Chromium or Google Chrome

  PM2 (for production)


4. Installation
  
  4.1 Update System
    sudo apt update && sudo apt upgrade -y

  4.2 Install Node.js
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs

      Verify:

      node -v
      npm -v

  4.3 Install Chrome
    sudo apt install -y chromium-browser


    or

    sudo apt install -y google-chrome-stable

  4.4 Install MySQL
    sudo apt install mysql-server -y
    sudo mysql_secure_installation


    Create database:

    CREATE DATABASE whatsapp_db;

5. Project Setup

    Clone or upload project:

    git clone <your-repo>
    cd whatsapp-bot


    Install dependencies:

    npm install

6. Environment Configuration

    Create .env file:

    PORT=3000
    DB_HOST=localhost
    DB_USER=your_user
    DB_PASSWORD=your_password
    DB_NAME=whatsapp_db

7. Required Directories

    Create required folders:

    mkdir sessions
    mkdir media
    chmod -R 755 sessions media

8. Running the Application

    Start in development:

    node app.js


    You will see:

    Server running at http://localhost:3000
    Scan QR for +xxxxxxxxxxx


    Scan QR using WhatsApp mobile app.

    Session will be stored in /sessions.

9. Production Deployment

    Install PM2:

    sudo npm install -g pm2


    Start app:

    pm2 start app.js --name whatsapp-bot


    Enable auto-start on reboot:

    pm2 save
    pm2 startup


    Check logs:

    pm2 logs whatsapp-bot

10. Session Management

    QR scan required only once

    Session stored in /sessions

    If session expires, QR must be scanned again

    Phone must remain connected to the internet

11. Media Storage

    All received media files are saved in:

    /media