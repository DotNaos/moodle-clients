import type React from "react";

export type IconComponent = React.ComponentType<{
  color?: string;
  size?: number;
}>;

declare const require: (id: string) => Record<string, IconComponent>;

const icons = require("lucide-react-native");

export const BookOpen = icons.BookOpen;
export const CalendarDays = icons.CalendarDays;
export const ChevronLeft = icons.ChevronLeft;
export const ChevronRight = icons.ChevronRight;
export const CircleHelp = icons.CircleHelp;
export const FileText = icons.FileText;
export const Link2 = icons.Link2;
export const RefreshCw = icons.RefreshCw;
export const ScanLine = icons.ScanLine;
export const Search = icons.Search;
export const Upload = icons.Upload;
export const UserRound = icons.UserRound;
export const X = icons.X;
