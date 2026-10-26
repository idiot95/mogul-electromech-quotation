import { Link } from "react-router";

export function NotFound() {
  return (
    <div className="page">
      <div className="empty">
        <h2>Page not found</h2>
        <p><Link to="/">Back to Home</Link></p>
      </div>
    </div>
  );
}
