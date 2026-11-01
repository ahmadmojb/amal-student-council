import { Link } from 'react-router-dom';
import { PageHeader } from '../components/ui/page';

export function NotFoundPage() {
  return (
    <>
      <PageHeader title="الصفحة غير موجودة" intro="قد يكون الرابط قديمًا أو مكتوبًا بشكل خاطئ." />
      <div className="container row">
        <Link to="/" className="btn btn-primary">
          العودة إلى الرئيسية
        </Link>
        <Link to="/program" className="btn">
          البرنامج اليومي
        </Link>
      </div>
    </>
  );
}
