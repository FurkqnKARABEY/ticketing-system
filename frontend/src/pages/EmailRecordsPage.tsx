import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getEmailRecords } from "../api/records";
import type { CommunicationRecord } from "../types/record";

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

const recordMatchesSearch = (record: CommunicationRecord, query: string) => {
  if (!query) return true;

  const text = [
    record.author_name,
    record.email_address,
    record.subject,
    record.summary,
    record.message_body,
    record.channel,
    record.direction,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return text.includes(query.toLowerCase());
};

export const EmailRecordsPage = () => {
  const navigate = useNavigate();

  const [records, setRecords] = useState<CommunicationRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadRecords = async () => {
    setIsLoading(true);
    setError("");

    try {
      const response = await getEmailRecords();
      setRecords(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load email records");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRecords();
  }, []);

  const filteredRecords = useMemo(() => {
    return records.filter((record) =>
      recordMatchesSearch(record, searchQuery.trim())
    );
  }, [records, searchQuery]);

  return (
    <>
      <section className="page-header tickets-header">
        <div>
          <h2>Email Records</h2>
          <p>Email messages captured from customer communication history.</p>
        </div>

        <button className="secondary-button" onClick={loadRecords}>
          Refresh
        </button>
      </section>

      {error && (
        <div className="error-box dashboard-error">
          {error}
          <button onClick={loadRecords}>Retry</button>
        </div>
      )}

      <section className="table-card">
        <div className="table-toolbar">
          <div>
            <strong>Email Record List</strong>
            <span>
              {filteredRecords.length.toLocaleString()} of{" "}
              {records.length.toLocaleString()} records
            </span>
          </div>

          <input
            className="search-input"
            value={searchQuery}
            placeholder="Search email records..."
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>

        {isLoading ? (
          <div className="empty-state">Loading email records...</div>
        ) : filteredRecords.length === 0 ? (
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
                {filteredRecords.map((record) => (
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
                      </div>
                    </td>

                    <td>{formatDate(record.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
};
