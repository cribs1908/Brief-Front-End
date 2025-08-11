"use client";
import { Navigate } from "react-router";

export default function ChatRedirect() {
  return <Navigate to="/dashboard" replace />;
}


