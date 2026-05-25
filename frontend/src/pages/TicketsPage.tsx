import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getTickets } from "../api/tickets";
import type { Pagination, Ticket } from "../types/ticket";

const formatDate = (value: string | null) => {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
};

const getStatusLabel = (status: string) => {
  return status.replace(/_/g, " ");
};

const getPriorityLabel = (priority: string) => {
  return priority.replace(/_/g, " ");
};

export const TicketsPage = () => {
  const navigate = useNavigate();

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadTickets = async (pageNumber = page) => {
    setIsLoading(true);
    setError("");

    try {
      const response = await getTickets(pageNumber, 10);
      setTickets(response.data);
      setPagination(response.pagination);
      setPage(response.pagination.page);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tickets");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTickets(1);
  }, []);

  const goToPreviousPage = () => {
    if (!pagination || pagination.page <= 1) return;
    loadTickets(pagination.page - 1);
  };

  const goToNextPage = () => {
    if (!pagination || pagination.page >= pagination.totalPages) return;
    loadTickets(pagination.page + 1);
  };

  return (
    <>
      <section className="page-header tickets-header">
        <div>
          <h2>Tickets</h2>
          <p>Review, prioritize, and manage customer support tickets.</p>
        </div>

        <button className="secondary-button" onClick={() => loadTickets(page)}>
          Refresh
        </button>
      </section>

      {error && (
        <div className="error-box dashboard-error">
          {error}
          <button onClick={() => loadTickets(page)}>Retry</button>
        </div>
      )}

      <section className="table-card">
        <div className="table-toolbar">
          <div>
            <strong>Ticket List</strong>
            <span>
              {pagination
                ? `${pagination.total.toLocaleString()} total tickets`
                : "Loading tickets"}
            </span>
          </div>
        </div>

        {isLoading ? (
          <div className="empty-state">Loading tickets...</div>
        ) : tickets.length === 0 ? (
          <div className="empty-state">No tickets found.</div>
        ) : (
          <div className="ticket-table-wrap">
            <table className="ticket-table">
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Source</th>
                  <th>Last Activity</th>
                  <th>Created</th>
                </tr>
              </thead>

              <tbody>
                {tickets.map((ticket) => (
                  <tr
                    key={ticket.id}
                    className="clickable-row"
                    onClick={() => navigate(`/tickets/${ticket.id}`)}
                  >
                    <td>
                      <strong>{ticket.ticket_number}</strong>
                    </td>

                    <td>
                      <div className="ticket-title-cell">
                        <strong>{ticket.title}</strong>
                        <span>{ticket.description || "No description"}</span>
                      </div>
                    </td>

                    <td>
                      <span className={`badge status-${ticket.status}`}>
                        {getStatusLabel(ticket.status)}
                      </span>
                    </td>

                    <td>
                      <span className={`badge priority-${ticket.priority}`}>
                        {getPriorityLabel(ticket.priority)}
                      </span>
                    </td>

                    <td>{ticket.source || "—"}</td>
                    <td>{formatDate(ticket.last_activity_at)}</td>
                    <td>{formatDate(ticket.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="pagination-bar">
          <button
            onClick={goToPreviousPage}
            disabled={!pagination || pagination.page <= 1 || isLoading}
          >
            Previous
          </button>

          <span>
            Page {pagination?.page || 1} of {pagination?.totalPages || 1}
          </span>

          <button
            onClick={goToNextPage}
            disabled={
              !pagination ||
              pagination.page >= pagination.totalPages ||
              isLoading
            }
          >
            Next
          </button>
        </div>
      </section>
    </>
  );
};