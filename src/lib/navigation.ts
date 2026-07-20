import {
  Home,
  MapPinned,
  Building2,
  Users,
  CreditCard,
  CalendarClock,
  FileBarChart,
  Settings,
  DollarSign,
  TrendingUp,
  IdCard,
  Landmark,
  Truck,
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
    title: "Terminals",
    href: "/dashboard/terminals",
    icon: Building2,
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
    title: "Shifts",
    href: "/dashboard/shifts",
    icon: CalendarClock,
  },
  {
    title: "Sales",
    href: "/dashboard/sales",
    icon: TrendingUp,
  },
  {
    title: "OTA Employees",
    href: "/dashboard/ota-employees",
    icon: IdCard,
  },
  {
    title: "OTA Terminals",
    href: "/dashboard/ota-terminals",
    icon: Landmark,
  },
  {
    title: "OTA Vehicles",
    href: "/dashboard/ota-vehicles",
    icon: Truck,
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