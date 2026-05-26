import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getCustomers } from "../api/customers";
import type { Customer, Pagination } from "../types/customer";

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

const displayText = (value: string | null) => {
  return value && value.trim().length > 0 ? value : "-";
};

export const CustomersPage = () => {
  const navigate = useNavigate();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadCustomers = async (pageNumber = page, query = searchQuery) => {
    setIsLoading(true);
    setError("");

    try {
      const response = await getCustomers(pageNumber, 10, query);
      setCustomers(response.data);
      setPagination(response.pagination);
      setPage(response.pagination.page);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load customers");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      loadCustomers(1, searchQuery);
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [searchQuery]);

  const goToPreviousPage = () => {
    if (!pagination || pagination.page <= 1) return;
    loadCustomers(pagination.page - 1, searchQuery);
  };

  const goToNextPage = () => {
    if (!pagination || pagination.page >= pagination.totalPages) return;
    loadCustomers(pagination.page + 1, searchQuery);
  };

  return (
    <>
      <section className="page-header tickets-header">
        <div>
          <h2>Customers</h2>
          <p>Browse customer profiles and their support history.</p>
        </div>

        <button
          className="secondary-button"
          onClick={() => loadCustomers(page, searchQuery)}
        >
          Refresh
        </button>
      </section>

      {error && (
        <div className="error-box dashboard-error">
          {error}
          <button onClick={() => loadCustomers(page, searchQuery)}>Retry</button>
        </div>
      )}

      <section className="table-card">
        <div className="table-toolbar">
          <div>
            <strong>Customer List</strong>
            <span>
              {pagination
                ? `${pagination.total.toLocaleString()} total customers`
                : "Loading customers"}
            </span>
          </div>

          <input
            className="search-input"
            value={searchQuery}
            placeholder="Search customers..."
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>

        {isLoading ? (
          <div className="empty-state">Loading customers...</div>
        ) : customers.length === 0 ? (
          <div className="empty-state">No customers found.</div>
        ) : (
          <div className="ticket-table-wrap">
            <table className="ticket-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Source</th>
                  <th>Created</th>
                </tr>
              </thead>

              <tbody>
                {customers.map((customer) => (
                  <tr
                    key={customer.id}
                    className="clickable-row"
                    onClick={() => navigate(`/customers/${customer.id}`)}
                  >
                    <td>
                      <strong>{displayText(customer.full_name)}</strong>
                      <div className="muted-cell">
                        {displayText(customer.first_name)}{" "}
                        {displayText(customer.last_name)}
                      </div>
                    </td>
                    <td>{displayText(customer.email_primary)}</td>
                    <td>{displayText(customer.phone_primary_normalized || customer.phone_primary)}</td>
                    <td>{displayText(customer.source)}</td>
                    <td>{formatDate(customer.created_at)}</td>
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

