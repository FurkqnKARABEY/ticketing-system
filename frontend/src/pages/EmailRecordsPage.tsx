import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getEmailRecords } from "../api/records";
import type { CommunicationRecord, Pagination } from "../types/record";

const formatDate = (value: string | null) => {
  if (!value) return "-";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
};

type RecordsView = "conversations" | "records";

export const EmailRecordsPage = () => {
  const navigate = useNavigate();

  const [records, setRecords] = useState<CommunicationRecord[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [view, setView] = useState<RecordsView>("conversations");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadRecords = async (
    pageNumber = page,
    query = searchQuery,
    nextView: RecordsView = view
  ) => {
    setIsLoading(true);
    setError("");

    try {
      const response = await getEmailRecords(pageNumber, 25, query, nextView);
      setRecords(response.data);
      setPagination(response.pagination || null);
      if (response.pagination) setPage(response.pagination.page);
      else setPage(pageNumber);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load email records");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRecords(1, searchQuery, view);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      loadRecords(1, searchQuery, view);
    }, 250);

    return () => window.clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  const goToPreviousPage = () => {
    if (!pagination || pagination.page <= 1) return;
    loadRecords(pagination.page - 1, searchQuery, view);
  };

  const goToNextPage = () => {
    if (!pagination || pagination.page >= pagination.totalPages) return;
    loadRecords(pagination.page + 1, searchQuery, view);
  };

  return (
    <>
      <section className="page-header tickets-header">
        <div>
          <h2>Email Records</h2>
          <p>Email messages captured from customer communication history.</p>
        </div>

        <button
          className="secondary-button"
          onClick={() => loadRecords(page, searchQuery, view)}
        >
          Refresh
        </button>
      </section>

      {error && (
        <div className="error-box dashboard-error">
          {error}
          <button onClick={() => loadRecords(page, searchQuery, view)}>Retry</button>
        </div>
      )}

      <section className="table-card">
        <div className="table-toolbar">
          <div>
            <strong>Email {view === "conversations" ? "Conversations" : "Records"}</strong>
            <span>
              {pagination
                ? `${pagination.total.toLocaleString()} total`
                : `${records.length.toLocaleString()} loaded`}
            </span>
          </div>

          <div className="table-toolbar-right">
            <div className="segmented-control">
              <button
                type="button"
                className={view === "conversations" ? "active" : ""}
                onClick={() => setView("conversations")}
              >
                Conversations
              </button>
              <button
                type="button"
                className={view === "records" ? "active" : ""}
                onClick={() => setView("records")}
              >
                All Records
              </button>
            </div>

            <input
              className="search-input"
              value={searchQuery}
              placeholder="Search email..."
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>
        </div>

        {isLoading ? (
          <div className="empty-state">Loading email records...</div>
        ) : records.length === 0 ? (
          <div className="empty-state">No email records found.</div>
        ) : (
          <div className="ticket-table-wrap">
            <table className="ticket-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>From</th>
                  <th>Subject</th>
                  <th>Summary</th>
                  <th>Created</th>
                </tr>
              </thead>

              <tbody>
                {records.map((record) => (
                  <tr
                    key={record.id}
                    className="clickable-row"
                    onClick={() => navigate(`/email-records/${record.id}`)}
                  >
                    <td>
                      {record.ticket_id ? (
                        <span className="badge status-closed">Ticket Created</span>
                      ) : (
                        <span className="badge status-new">Record Only</span>
                      )}
                    </td>

                    <td>
                      <strong>
                        {record.author_name || record.email_address || "Unknown"}
                      </strong>
                    </td>

                    <td>
                      <div className="ticket-title-cell">
                        <strong>{record.subject || "No subject"}</strong>
                        <span>{record.email_address || "No email address"}</span>
                      </div>
                    </td>

                    <td>
                      <div className="ticket-title-cell">
                        <span>{record.summary || record.message_body || "No summary"}</span>
                        {view === "conversations" && record.thread_count ? (
                          <small>{record.thread_count} records</small>
                        ) : null}
                      </div>
                    </td>

                    <td>{formatDate(record.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pagination && (
          <div className="pagination-bar">
            <button
              onClick={goToPreviousPage}
              disabled={pagination.page <= 1 || isLoading}
            >
              Previous
            </button>

            <span>
              Page {pagination.page} of {pagination.totalPages}
            </span>

            <button
              onClick={goToNextPage}
              disabled={pagination.page >= pagination.totalPages || isLoading}
            >
              Next
            </button>
          </div>
        )}
      </section>
    </>
  );
};

