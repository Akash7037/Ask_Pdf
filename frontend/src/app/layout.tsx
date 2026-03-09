import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Ask PDF - Advanced AI Assistant',
  description: 'Upload a PDF and ask any questions leveraging modern AI',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
