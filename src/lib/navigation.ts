import {
  Home,
  MapPinned,
  Users,
  CreditCard,
  FileBarChart,
  Settings,
  DollarSign
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
    title: "Fare Matrix",
    href: "/dashboard/fare-price-matrix",
    icon: DollarSign,
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