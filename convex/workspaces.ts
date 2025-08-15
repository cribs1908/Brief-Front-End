/**
 * Workspace Management - Multi-tenant support
 * Implements PRD Section 6 - User Management & Billing
 */

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

// Types for workspace plans
type WorkspacePlan = "free" | "pro" | "enterprise";
type UserRole = "viewer" | "editor" | "admin";

const now = () => Date.now();

// === WORKSPACE MANAGEMENT ===

export const createWorkspace = mutation({
  args: {
    name: v.string(),
    ownerId: v.string(), // Clerk user ID
    plan: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const plan: WorkspacePlan = (args.plan as WorkspacePlan) || "free";
    
    // Create workspace
    const workspaceId = await ctx.db.insert("workspaces", {
      name: args.name,
      plan,
      ownerId: args.ownerId,
      createdAt: now(),
    });
    
    // Add owner as admin member
    await ctx.db.insert("memberships", {
      workspaceId,
      userId: args.ownerId,
      role: "admin",
      createdAt: now(),
    });
    
    return workspaceId;
  },
});

export const getUserWorkspaces = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    // Get user memberships
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    
    // Get workspace details
    const workspaces = [];
    for (const membership of memberships) {
      const workspace = await ctx.db.get(membership.workspaceId);
      if (workspace) {
        workspaces.push({
          ...workspace,
          role: membership.role,
          membershipId: membership._id,
        });
      }
    }
    
    return workspaces;
  },
});

export const getWorkspaceById = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.workspaceId);
  },
});

export const getWorkspaceMembers = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
    
    // Get user details for each member
    const members = [];
    for (const membership of memberships) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_clerk", (q) => q.eq("clerkId", membership.userId))
        .first();
      
      if (user) {
        members.push({
          membershipId: membership._id,
          userId: membership.userId,
          role: membership.role,
          createdAt: membership.createdAt,
          user: {
            name: user.name,
            email: user.email,
            image: user.image,
          },
        });
      }
    }
    
    return members;
  },
});

export const updateWorkspace = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    name: v.optional(v.string()),
    plan: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { workspaceId, ...updates } = args;
    await ctx.db.patch(workspaceId, updates);
  },
});

export const deleteWorkspace = mutation({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    // Delete all memberships
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
    
    for (const membership of memberships) {
      await ctx.db.delete(membership._id);
    }
    
    // Delete workspace
    await ctx.db.delete(args.workspaceId);
  },
});

// === MEMBERSHIP MANAGEMENT ===

export const inviteUserToWorkspace = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    userId: v.string(),
    role: v.string(),
  },
  handler: async (ctx, args) => {
    const role: UserRole = args.role as UserRole;
    
    // Check if membership already exists
    const existing = await ctx.db
      .query("memberships")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .filter((q) => q.eq(q.field("userId"), args.userId))
      .first();
    
    if (existing) {
      throw new Error("User is already a member of this workspace");
    }
    
    // Create membership
    const membershipId = await ctx.db.insert("memberships", {
      workspaceId: args.workspaceId,
      userId: args.userId,
      role,
      createdAt: now(),
    });
    
    return membershipId;
  },
});

export const updateMemberRole = mutation({
  args: {
    membershipId: v.id("memberships"),
    role: v.string(),
  },
  handler: async (ctx, args) => {
    const role: UserRole = args.role as UserRole;
    await ctx.db.patch(args.membershipId, { role });
  },
});

export const removeMemberFromWorkspace = mutation({
  args: { membershipId: v.id("memberships") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.membershipId);
  },
});

// === USER MANAGEMENT ===

export const createOrUpdateUser = mutation({
  args: {
    clerkId: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    image: v.optional(v.string()),
    tokenIdentifier: v.string(),
  },
  handler: async (ctx, args) => {
    // Check if user exists by Clerk ID
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk", (q) => q.eq("clerkId", args.clerkId))
      .first();
    
    if (existing) {
      // Update existing user
      await ctx.db.patch(existing._id, {
        name: args.name,
        email: args.email,
        image: args.image,
        tokenIdentifier: args.tokenIdentifier,
      });
      return existing._id;
    } else {
      // Create new user
      return await ctx.db.insert("users", {
        clerkId: args.clerkId,
        name: args.name,
        email: args.email,
        image: args.image,
        tokenIdentifier: args.tokenIdentifier,
      });
    }
  },
});

export const getUserByClerkId = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_clerk", (q) => q.eq("clerkId", args.clerkId))
      .first();
  },
});

// === PERMISSIONS & ACCESS CONTROL ===

export const getUserWorkspaceRole = query({
  args: {
    workspaceId: v.id("workspaces"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .filter((q) => q.eq(q.field("userId"), args.userId))
      .first();
    
    return membership?.role || null;
  },
});

export const canUserAccessWorkspace = query({
  args: {
    workspaceId: v.id("workspaces"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .filter((q) => q.eq(q.field("userId"), args.userId))
      .first();
    
    return membership !== null;
  },
});

export const canUserPerformAction = query({
  args: {
    workspaceId: v.id("workspaces"),
    userId: v.string(),
    action: v.string(), // "view" | "create" | "edit" | "admin"
  },
  handler: async (ctx, args) => {
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .filter((q) => q.eq(q.field("userId"), args.userId))
      .first();
    
    if (!membership) return false;
    
    const { role } = membership;
    const { action } = args;
    
    // Permission matrix
    const permissions = {
      viewer: ["view"],
      editor: ["view", "create", "edit"],
      admin: ["view", "create", "edit", "admin"],
    };
    
    return permissions[role as UserRole]?.includes(action) || false;
  },
});

// === BILLING & PLAN MANAGEMENT ===

export const updateWorkspacePlan = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    plan: v.string(),
  },
  handler: async (ctx, args) => {
    const plan: WorkspacePlan = args.plan as WorkspacePlan;
    await ctx.db.patch(args.workspaceId, { plan });
    
    // Log the plan change
    const workspace = await ctx.db.get(args.workspaceId);
    if (workspace) {
      await ctx.db.insert("auditLogs", {
        workspaceId: args.workspaceId,
        actor: workspace.ownerId,
        action: "plan_updated",
        target: args.workspaceId,
        metadata: { newPlan: plan },
        createdAt: now(),
      });
    }
  },
});

export const getWorkspaceUsage = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    // Get job count for this workspace
    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
    
    // Get member count
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
    
    // Calculate usage metrics
    const totalJobs = jobs.length;
    const completedJobs = jobs.filter(job => job.status === "READY").length;
    const failedJobs = jobs.filter(job => job.status === "FAILED").length;
    const totalMembers = memberships.length;
    
    // Get total pages processed
    const totalPages = jobs.reduce((sum, job) => {
      return sum + (job.metrics?.pagesTotal || 0);
    }, 0);
    
    // Get total OCR pages
    const ocrPages = jobs.reduce((sum, job) => {
      return sum + (job.metrics?.ocrPages || 0);
    }, 0);
    
    return {
      totalJobs,
      completedJobs,
      failedJobs,
      totalMembers,
      totalPages,
      ocrPages,
      successRate: totalJobs > 0 ? (completedJobs / totalJobs) * 100 : 0,
    };
  },
});

// === WORKSPACE SETTINGS ===

export const getWorkspaceSettings = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const workspace = await ctx.db.get(args.workspaceId);
    if (!workspace) return null;
    
    // Get active subscription
    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();
    
    return {
      workspace,
      subscription,
    };
  },
});

export const createDefaultWorkspaceForUser = mutation({
  args: {
    userId: v.string(),
    userEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const workspaceName = args.userEmail 
      ? `${args.userEmail.split('@')[0]}'s Workspace`
      : "My Workspace";
    
    return await ctx.runMutation(api.workspaces.createWorkspace, {
      name: workspaceName,
      ownerId: args.userId,
      plan: "free",
    });
  },
});