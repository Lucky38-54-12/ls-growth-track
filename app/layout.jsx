import './globals.css';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';

export const metadata = {
  title: 'LS Growth Dashboard',
  description: 'Premium automation dashboard for lead generation',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-dark text-white font-sans">
        <div className="flex h-screen">
          <Sidebar />
          <div className="flex-1 flex flex-col overflow-hidden">
            <Header />
            <main className="flex-1 overflow-auto">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
