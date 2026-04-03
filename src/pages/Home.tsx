import HomeAgentStudio from "@/components/home-agent/HomeAgentStudio";
import { useSearchParams } from "react-router-dom";

export default function Home() {
  const [searchParams, setSearchParams] = useSearchParams();
  const utility = searchParams.get("utility") === "settings" ? "settings" : undefined;

  const handleUtilityChange = (next?: "settings") => {
    const updated = new URLSearchParams(searchParams);
    if (next) {
      updated.set("utility", next);
    } else {
      updated.delete("utility");
    }
    setSearchParams(updated, { replace: true });
  };

  return <HomeAgentStudio initialUtility={utility} onUtilityChange={handleUtilityChange} />;
}
