import type { Metadata } from "next";
import SEO from "@/config/SEO.json";

export const metadata: Metadata = {
  title: SEO.NotFound.title,
  description: SEO.NotFound.description,
};

const NotFound = () => {
  return (
    <div className="flex items-center justify-center w-full h-96 m-auto">
      <div className="text-center">
        <p className="text-5xl">404</p>
        <p className="">Page Not Found</p>
      </div>
    </div>
  );
};

export default NotFound;
