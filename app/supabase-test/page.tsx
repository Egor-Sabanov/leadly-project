import { notFound } from "next/navigation";
import DevelopmentConnectionCheck from "@/components/workspace/DevelopmentConnectionCheck";
export default function ConnectionCheckPage() {
 if (process.env.NODE_ENV === "production") notFound();
 return <DevelopmentConnectionCheck />;
}
