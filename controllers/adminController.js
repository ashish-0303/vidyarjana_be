
import { body, validationResult } from "express-validator";
import { sql, getPool } from "../models/db.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

// Email transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Superadmin credentials
const superadminEmail = "nileshmisal0106@gmail.com";
const superadminPassword = "superadmin123";

// Add Admin
const addAdmin = [
  body("username").trim().notEmpty().withMessage("Username is required"),
  body("email").isEmail().withMessage("Valid email is required"),
  body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
  body("academy").trim().notEmpty().withMessage("Academy is required"),

  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { username, email, password, academy } = req.body;
    const userRole = "admin";

    try {
      const pool = getPool();

      const existing = await pool.request()
        .input("username", sql.VarChar, username)
        .input("email", sql.VarChar, email)
        .query("SELECT * FROM admins WHERE username = @username OR CAST(email AS VARCHAR(255)) = @email");

      const existingAdmin = existing.recordset[0];

      if (existingAdmin) {
        if (existingAdmin.username === username) return res.status(409).json({ error: "Username already exists" });
        if (existingAdmin.email === email) return res.status(409).json({ error: "Email already exists" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const result = await pool.request()
        .input("username", sql.VarChar, username)
        .input("email", sql.VarChar, email)
        .input("password", sql.VarChar, hashedPassword)
        .input("academy", sql.VarChar, academy)
        .input("userrole", sql.VarChar, userRole)
        .query(`
          INSERT INTO admins (username, email, password, academy, userrole)
          OUTPUT INSERTED.id, INSERTED.username, INSERTED.email, INSERTED.academy, INSERTED.userrole
          VALUES (@username, @email, @password, @academy, @userrole)
        `);

      res.status(201).json({ message: "Admin added successfully", admin: result.recordset[0] });

    } catch (err) {
      console.error("Error adding admin:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
];

// Login Admin
const loginAdmin = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password are required" });

  try {
    const pool = getPool();

    const result = await pool.request()
      .input("email", sql.VarChar, email)
      .query("SELECT * FROM admins WHERE CAST(email AS VARCHAR(255)) = @email");

    const admin = result.recordset[0];
    if (!admin) return res.status(401).json({ error: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign(
      { id: admin.id, email: admin.email, role: admin.userrole },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    res.json({
      message: "Login successful",
      token,
      admin: {
        id: admin.id,
        username: admin.username,
        email: admin.email,
        userRole: admin.userrole,
        academy: admin.academy,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

// Forgot Password
const forgotPassword = async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email is required" });

  try {
    const pool = getPool();

    const result = await pool.request()
      .input("email", sql.VarChar, email)
      .query("SELECT * FROM admins WHERE CAST(email AS VARCHAR(255)) = @email");

    const admin = result.recordset[0];
    if (!admin) return res.status(404).json({ error: "No account found with this email" });

    const resetToken = jwt.sign(
      { id: admin.id, email: admin.email },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    await pool.request()
      .input("token", sql.VarChar, resetToken)
      .input("expires", sql.DateTime, new Date(Date.now() + 3600000))
      .input("id", sql.Int, admin.id)
      .query("UPDATE admins SET reset_token = @token, reset_token_expires = @expires WHERE id = @id");

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Password Reset Request - RFID Race Logger",
      html: `
        <h2>Password Reset Request</h2>
        <p>Hello ${admin.username},</p>
        <p>You have requested to reset your password. Click the link below to reset it:</p>
        <p><a href="${resetUrl}" style="background-color: #4CAF50; color: white; padding: 10px 20px;">Reset Password</a></p>
        <p>This link will expire in 1 hour.</p>
      `,
    };

    await transporter.sendMail(mailOptions);
    res.json({ message: "Password reset email sent successfully" });

  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Reset Password
const resetPassword = async (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) return res.status(400).json({ error: "Token and new password are required" });
  if (newPassword.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const pool = getPool();

    const result = await pool.request()
      .input("id", sql.Int, decoded.id)
      .input("token", sql.VarChar, token)
      .input("now", sql.DateTime, new Date())
      .query(`
        SELECT * FROM admins
        WHERE id = @id AND reset_token = @token AND reset_token_expires > @now
      `);

    const admin = result.recordset[0];
    if (!admin) return res.status(400).json({ error: "Invalid or expired token" });

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await pool.request()
      .input("password", sql.VarChar, hashedPassword)
      .input("id", sql.Int, decoded.id)
      .query(`
        UPDATE admins
        SET password = @password, reset_token = NULL, reset_token_expires = NULL
        WHERE id = @id
      `);

    res.json({ message: "Password reset successfully" });

  } catch (err) {
    console.error("Reset error:", err);
    res.status(400).json({ error: "Invalid or expired reset token" });
  }
};

// Get all admins
const getAllAdmins = async (req, res) => {
  try {
    const pool = getPool();

    const result = await pool.request().query(`
      SELECT id, username, email, academy, userrole
      FROM admins
      ORDER BY id DESC
    `);
    res.json({ admins: result.recordset });
  } catch (err) {
    console.error("Get admins error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Delete admin
const deleteAdmin = async (req, res) => {
  const { id } = req.params;

  try {
    const pool = getPool();

    const result = await pool.request()
      .input("id", sql.Int, id)
      .query(`
        DELETE FROM admins
        OUTPUT DELETED.*
        WHERE id = @id
      `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: "Admin not found" });
    }

    res.json({ message: "Admin deleted successfully", admin: result.recordset[0] });
  } catch (err) {
    console.error("Delete admin error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Create superadmin
const createSuperadminIfNotExist = async (pool) => {
  try {
    const result = await pool.request()
      .input("email", sql.VarChar, superadminEmail)
      .query("SELECT * FROM admins WHERE CAST(email AS VARCHAR(255)) = @email");

    if (result.recordset.length === 0) {
      const hashedPassword = await bcrypt.hash(superadminPassword, 10);
      await pool.request()
        .input("username", sql.VarChar, "superadmin")
        .input("email", sql.VarChar, superadminEmail)
        .input("password", sql.VarChar, hashedPassword)
        .input("academy", sql.VarChar, "Superadmin Academy")
        .input("userrole", sql.VarChar, "superadmin")
        .query(`
          INSERT INTO admins (username, email, password, academy, userrole)
          VALUES (@username, @email, @password, @academy, @userrole)
        `);
      console.log("✅ Superadmin created");
    } else {
      console.log("Superadmin already exists");
    }
  } catch (err) {
    console.error("Error creating superadmin:", err);
  }
};

export {
  addAdmin,
  loginAdmin,
  forgotPassword,
  resetPassword,
  getAllAdmins,
  deleteAdmin,
  createSuperadminIfNotExist,
};