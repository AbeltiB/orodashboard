import {
  Home,
  MapPinned,
  Users,
  CreditCard,
  FileBarChart,
  Settings,
} from "lucide-react";

export const navigation = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: Home,
  },

  {
    title: "Stations",
    href: "/dashboard/stations",
    icon: MapPinned,
  },

  {
    title: "Employees",
    href: "/dashboard/employees",
    icon: Users,
  },

  {
    title: "POS Machines",
    href: "/dashboard/pos-machines",
    icon: CreditCard,
  },

  {
    title: "Reports",
    href: "/dashboard/reports",
    icon: FileBarChart,
  },

  {
    title: "Settings",
    href: "/dashboard/settings",
    icon: Settings,
  },
];