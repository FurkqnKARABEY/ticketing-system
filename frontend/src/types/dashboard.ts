export type DashboardStats = {
  tickets: {
    total: number;
    new: number;
    open: number;
    pending: number;
    closed: number;
  };
  priority: {
    high: number;
    urgent: number;
  };
  customers: {
    total: number;
  };
  communications: {
    total: number;
  };
  attachments: {
    total: number;
  };
};

export type DashboardStatsResponse = {
  success: boolean;
  data: DashboardStats;
};