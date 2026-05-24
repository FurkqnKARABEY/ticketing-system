"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const supabase_1 = require("../config/supabase");
const router = (0, express_1.Router)();
router.get("/stats", async (_req, res) => {
    try {
        const [totalTickets, newTickets, openTickets, pendingTickets, closedTickets, highPriorityTickets, urgentTickets, totalCustomers, totalCommunications, totalAttachments,] = await Promise.all([
            supabase_1.supabase.from("tickets").select("id", { count: "exact", head: true }),
            supabase_1.supabase
                .from("tickets")
                .select("id", { count: "exact", head: true })
                .eq("status", "new"),
            supabase_1.supabase
                .from("tickets")
                .select("id", { count: "exact", head: true })
                .eq("status", "open"),
            supabase_1.supabase
                .from("tickets")
                .select("id", { count: "exact", head: true })
                .eq("status", "pending"),
            supabase_1.supabase
                .from("tickets")
                .select("id", { count: "exact", head: true })
                .eq("status", "closed"),
            supabase_1.supabase
                .from("tickets")
                .select("id", { count: "exact", head: true })
                .eq("priority", "high"),
            supabase_1.supabase
                .from("tickets")
                .select("id", { count: "exact", head: true })
                .eq("priority", "urgent"),
            supabase_1.supabase.from("customers").select("id", { count: "exact", head: true }),
            supabase_1.supabase
                .from("communications")
                .select("id", { count: "exact", head: true }),
            supabase_1.supabase.from("attachments").select("id", { count: "exact", head: true }),
        ]);
        const errors = [
            totalTickets.error,
            newTickets.error,
            openTickets.error,
            pendingTickets.error,
            closedTickets.error,
            highPriorityTickets.error,
            urgentTickets.error,
            totalCustomers.error,
            totalCommunications.error,
            totalAttachments.error,
        ].filter(Boolean);
        if (errors.length > 0) {
            return res.status(500).json({
                success: false,
                message: "Failed to fetch dashboard stats",
                errors: errors.map((error) => error?.message),
            });
        }
        return res.json({
            success: true,
            data: {
                tickets: {
                    total: totalTickets.count || 0,
                    new: newTickets.count || 0,
                    open: openTickets.count || 0,
                    pending: pendingTickets.count || 0,
                    closed: closedTickets.count || 0,
                },
                priority: {
                    high: highPriorityTickets.count || 0,
                    urgent: urgentTickets.count || 0,
                },
                customers: {
                    total: totalCustomers.count || 0,
                },
                communications: {
                    total: totalCommunications.count || 0,
                },
                attachments: {
                    total: totalAttachments.count || 0,
                },
            },
        });
    }
    catch {
        return res.status(500).json({
            success: false,
            message: "Unexpected server error",
        });
    }
});
exports.default = router;
