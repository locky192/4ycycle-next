'use client';

import BitcoinChart from '@/components/BitcoinChart';
import BlogPost from '@/components/BlogPost';

export default function Home() {
  return (
    <div className="bg-[#1a1a1a] text-[#f1f1f1] min-h-screen">
      <div className="plot-container">
        <BitcoinChart />
      </div>
      <BlogPost />
    </div>
  );
}