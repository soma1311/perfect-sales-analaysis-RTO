import { DataTable } from "@/components/DataTable";
import { FileUpload } from "@/components/FileUpload";
import { MapControls } from "@/components/MapControls";
import { MapVisualization } from "@/components/MapVisualization";
import { MetricsOverview } from "@/components/MetricsOverview";
import { Button } from "@/components/ui/button";
import { YearFilter } from "@/components/YearFilter";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ChartLine, Download, User } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { districts } from "../lib/districts";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";

export default function Dashboard() {
  const [selectedYears, setSelectedYears] = useState<string[]>(['2022', '2023', '2024', '2025']);
  const [selectedMakers, setSelectedMakers] = useState<string[]>([]);
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [selectedRTOs, setSelectedRTOs] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'heatmap' | 'markers' | 'clusters'>('markers');
  const [showLabels, setShowLabels] = useState(true);
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [selectedDistricts, setSelectedDistricts] = useState<string[]>([]);

  // Fetch sales data from backend
  const { data: salesDataRaw = [] } = useQuery({
    queryKey: ["/api/sales-data"],
  });
  const salesData = salesDataRaw as any[];

  // Derive unique filter values from uploaded data
  const makers = Array.from(new Set(
    salesData
      .filter(item =>
        (selectedStates.length === 0 || selectedStates.includes(item.state)) &&
        (selectedDistricts.length === 0 || selectedDistricts.includes(item.district)) &&
        (selectedRTOs.length === 0 || selectedRTOs.includes(item.rto || item.RTO))
      )
      .map((item: any) => item.maker)
      .filter(Boolean) as string[]
  )).sort();
  const rtos = Array.from(new Set(salesData.map((item: any) => item.RTO || item.rto).filter(Boolean) as string[])).sort();
  // Memoize states array for performance
  const states = useMemo(() => Array.from(new Set(salesData.map((item: any) => item.state).filter(Boolean) as string[])).sort(), [salesData]);

  // State search for dropdown
  const [stateSearch, setStateSearch] = useState("");
  const filteredStates = useMemo(() => {
    if (!stateSearch) return states;
    return states.filter(s => s.toLowerCase().includes(stateSearch.toLowerCase()));
  }, [states, stateSearch]);
  const districts = Array.from(new Set(salesData.map((item: any) => item.district).filter(Boolean) as string[])).sort();
  const years = ["2022", "2023", "2024", "2025"].filter(y => salesData.some((item: any) => item[`sales${y}`] > 0));

  // Dynamically extract month columns from the uploaded Excel data
  const monthKeys = salesData.length > 0
    ? Object.keys(salesData[0]).filter(key =>
        ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].includes(key.trim().toLowerCase())
      )
    : [];
  const months = monthKeys.length > 0 ? monthKeys.map(m => m.toUpperCase()) : [
    "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
    "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"
  ];

  console.log("Selected Makers:", selectedMakers);
  console.log("Selected RTOs:", selectedRTOs);
  console.log("Selected States:", selectedStates);
  console.log("All Districts in data:", salesData.map(item => item.district));
  const filteredRows = salesData.filter(item =>
    selectedMakers.some(
      m => m.trim().toLowerCase() === String(item.maker).trim().toLowerCase()
    )
  );
  console.log("Filtered rows for selected makers:", filteredRows);
  console.log("RTOs in filtered rows:", filteredRows.map(item => item.rto));

  const filteredRTOs = (selectedMakers.length > 0 || selectedStates.length > 0 || selectedDistricts.length > 0)
    ? Array.from(new Set(
        salesData
          .filter(item =>
            (selectedMakers.length === 0 || selectedMakers.includes(item.maker)) &&
            (selectedStates.length === 0 || selectedStates.includes(item.state)) &&
            (selectedDistricts.length === 0 || selectedDistricts.includes(item.district))
          )
          .map(item => (item.rto || "").trim())
          .filter(Boolean)
      )).sort()
    : rtos;

  // When RTO is selected, auto-select state and filter districts
  const selectedRTOData = salesData.find((item: any) => selectedRTOs.length === 1 && (item.RTO === selectedRTOs[0] || item.rto === selectedRTOs[0]) && (selectedMakers.length === 0 || selectedMakers.includes(item.maker)));
  const autoSelectedState = selectedRTOData ? selectedRTOData.state : undefined;

  // If a state is auto-selected, use it for filtering and disable manual selection
  const effectiveSelectedStates = autoSelectedState ? [autoSelectedState] : selectedStates;
  const isStateDisabled = !!autoSelectedState;

  const isAllRTOsSelected = selectedRTOs.length === filteredRTOs.length && filteredRTOs.length > 0;
  const debugFilteredRows = salesData.filter(item =>
    (selectedStates.length === 0 || selectedStates.includes(item.state)) &&
    (selectedMakers.length === 0 || selectedMakers.includes(item.maker)) &&
    (
      isAllRTOsSelected ||
      selectedRTOs.length === 0 ||
      selectedRTOs.includes(item.rto)
    )
  );
  console.log("Filtered rows for Districts:", debugFilteredRows);
  console.log("Districts in filtered rows:", debugFilteredRows.map(item => item.district));

  const filteredDistricts = (selectedStates.length > 0 || selectedMakers.length > 0)
    ? Array.from(new Set(
        salesData
          .filter(item =>
            (selectedStates.length === 0 || selectedStates.includes(item.state)) &&
            (selectedMakers.length === 0 || selectedMakers.includes(item.maker)) &&
            (
              isAllRTOsSelected ||
              selectedRTOs.length === 0 ||
              selectedRTOs.includes(item.rto)
            )
          )
          .map(item => item.district)
          .filter(Boolean)
      )).sort()
    : districts;

  const filteredMapData = salesData.filter(item =>
    (selectedStates.length === 0 || selectedStates.includes(item.state)) &&
    (selectedDistricts.length === 0 || selectedDistricts.includes(item.district))
  );

  const yearOptions = ["2022", "2023", "2024", "2025"];

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <header className="bg-white border-b border-neutral-200 shadow-sm">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between w-full">
              {/* Left: Logo and Titles */}
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
                  <ChartLine className="text-white text-lg" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-neutral-900">Sales Analytics</h1>
                  <p className="text-sm text-neutral-500">India Market Intelligence Platform</p>
                </div>
              </div>
              {/* Right: Export Report, User Icon, and Clear Data Button */}
              <div className="flex items-center space-x-4 ml-auto">
                <Button variant="outline" className="text-sm font-medium">
                  <Download className="mr-2 h-4 w-4" />
                  Export Report
                </Button>
                <Button variant="destructive" className="text-sm font-medium" onClick={async () => {
                  await axios.post("/api/clear-sales-data");
                  window.location.reload();
                }}>
                  Clear Data
                </Button>
                <div className="w-8 h-8 bg-neutral-300 rounded-full flex items-center justify-center">
                  <User className="text-neutral-600 text-sm" />
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Main Dashboard */}
        <main className="px-8 py-8">
          {/* Executive Metrics Overview */}
          <MetricsOverview />

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* Data Upload and Controls */}
            <div className="lg:col-span-1 space-y-6">
              <MapControls
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                showLabels={showLabels}
                onShowLabelsChange={setShowLabels}
              />
              {/* FileUpload */}
              <FileUpload />
            </div>

            {/* Map Visualization and Filters */}
            <div className="lg:col-span-3 flex flex-col gap-6">
              {/* Filters Row */}
              <div className="flex flex-wrap gap-4 bg-white p-4 rounded-lg shadow-sm mb-4 items-end">
                {/* Maker Dropdown */}
                <div className="min-w-[220px]">
                  <label className="block text-sm font-medium text-neutral-700 mb-2">Maker</label>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="w-full justify-between">
                        {selectedMakers.length === makers.length ? 'All' : `${selectedMakers.length} selected`}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="max-h-72 overflow-y-auto w-full min-w-[220px]" onCloseAutoFocus={e => e.preventDefault()}>
                      <DropdownMenuCheckboxItem
                        checked={selectedMakers.length === makers.length}
                        onCheckedChange={checked => {
                          setSelectedMakers(checked ? makers : []);
                        }}
                        onSelect={e => e.preventDefault()}
                      >
                        All
                      </DropdownMenuCheckboxItem>
                      {makers.map(maker => (
                        <DropdownMenuCheckboxItem
                          key={maker}
                          checked={selectedMakers.includes(maker)}
                          onCheckedChange={checked => {
                            setSelectedMakers(checked
                              ? [...selectedMakers, maker]
                              : selectedMakers.filter(m => m !== maker)
                            );
                          }}
                          onSelect={e => e.preventDefault()}
                        >
                          {maker}
                        </DropdownMenuCheckboxItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {/* RTO Dropdown */}
                <div className="min-w-[220px]">
                  <label className="block text-sm font-medium text-neutral-700 mb-2">RTO</label>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="w-full justify-between">
                        {selectedRTOs.length === filteredRTOs.length && filteredRTOs.length > 0 ? 'All' : `${selectedRTOs.length} selected`}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="max-h-72 overflow-y-auto w-full min-w-[220px]" onCloseAutoFocus={e => e.preventDefault()}>
                      {filteredRTOs.length > 0 && (
                        <DropdownMenuCheckboxItem
                          checked={selectedRTOs.length === filteredRTOs.length}
                          onCheckedChange={checked => {
                            setSelectedRTOs(checked ? filteredRTOs : []);
                          }}
                          onSelect={e => e.preventDefault()}
                        >
                          All
                        </DropdownMenuCheckboxItem>
                      )}
                      {filteredRTOs.map(rto => (
                        <DropdownMenuCheckboxItem
                          key={rto}
                          checked={selectedRTOs.includes(rto)}
                          onCheckedChange={checked => {
                            setSelectedRTOs(checked
                              ? [...selectedRTOs, rto]
                              : selectedRTOs.filter(r => r !== rto)
                            );
                          }}
                          onSelect={e => e.preventDefault()}
                        >
                          {rto}
                        </DropdownMenuCheckboxItem>
                      ))}
                      {filteredRTOs.length === 0 && (
                        <div className="px-4 py-2 text-neutral-400">No RTOs available</div>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {/* State Dropdown */}
                <div className="min-w-[220px]">
                  <label className="block text-sm font-medium text-neutral-700 mb-2">State</label>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="w-full justify-between" disabled={isStateDisabled}>
                        {effectiveSelectedStates.length === states.length ? 'All' : `${effectiveSelectedStates.length} selected`}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="max-h-72 overflow-y-auto w-full min-w-[220px]" onCloseAutoFocus={e => e.preventDefault()}>
                      <div className="px-2 py-2">
                        <input
                          type="text"
                          placeholder="Search state..."
                          value={stateSearch}
                          onChange={e => setStateSearch(e.target.value)}
                          className="w-full px-2 py-1 border rounded text-sm"
                        />
                      </div>
                      <DropdownMenuCheckboxItem
                        checked={effectiveSelectedStates.length === states.length}
                        onCheckedChange={checked => {
                          setSelectedStates(checked ? states : []);
                          setSelectedDistricts(checked ? filteredDistricts : []);
                        }}
                        onSelect={e => e.preventDefault()}
                      >
                        All
                      </DropdownMenuCheckboxItem>
                      {filteredStates.map(state => (
                        <DropdownMenuCheckboxItem
                          key={state}
                          checked={effectiveSelectedStates.includes(state)}
                          onCheckedChange={checked => {
                            setSelectedStates(checked
                              ? [...effectiveSelectedStates, state]
                              : effectiveSelectedStates.filter(s => s !== state)
                            );
                            setSelectedDistricts(prev => prev.filter(d => {
                              const districtObj = filteredDistricts.find(dist => dist === d);
                              return districtObj && (checked ? [...effectiveSelectedStates, state] : effectiveSelectedStates.filter(s => s !== state)).includes(districtObj);
                            }));
                          }}
                          onSelect={e => e.preventDefault()}
                        >
                          {state}
                        </DropdownMenuCheckboxItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {/* District Dropdown */}
                <div className="min-w-[220px]">
                  <label className="block text-sm font-medium text-neutral-700 mb-2">District</label>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="w-full justify-between" disabled={effectiveSelectedStates.length === 0}>
                        {selectedDistricts.length === filteredDistricts.length && filteredDistricts.length > 0 ? 'All' : `${selectedDistricts.length} selected`}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="max-h-72 overflow-y-auto w-full min-w-[220px]" onCloseAutoFocus={e => e.preventDefault()}>
                      {filteredDistricts.length > 0 && (
                        <DropdownMenuCheckboxItem
                          checked={selectedDistricts.length === filteredDistricts.length && filteredDistricts.length > 0}
                          onCheckedChange={checked => {
                            setSelectedDistricts(checked ? filteredDistricts : []);
                          }}
                          onSelect={e => e.preventDefault()}
                        >
                          All
                        </DropdownMenuCheckboxItem>
                      )}
                      {filteredDistricts.map(d => (
                        <DropdownMenuCheckboxItem
                          key={d}
                          checked={selectedDistricts.includes(d)}
                          onCheckedChange={checked => {
                            setSelectedDistricts(checked
                              ? [...selectedDistricts, d]
                              : selectedDistricts.filter(dist => dist !== d)
                            );
                          }}
                          onSelect={e => e.preventDefault()}
                        >
                          {d}
                        </DropdownMenuCheckboxItem>
                      ))}
                      {filteredDistricts.length === 0 && (
                        <div className="px-4 py-2 text-neutral-400">No Districts available</div>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {/* Months Dropdown */}
                <div className="min-w-[220px]">
                  <label className="block text-sm font-medium text-neutral-700 mb-2">Months</label>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="w-full justify-between">
                        {selectedMonths.length === months.length ? 'All' : `${selectedMonths.length} selected`}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="max-h-72 overflow-y-auto w-full min-w-[220px]" onCloseAutoFocus={e => e.preventDefault()}>
                      <DropdownMenuCheckboxItem
                        checked={selectedMonths.length === months.length}
                        onCheckedChange={checked => {
                          setSelectedMonths(checked ? months : []);
                        }}
                        onSelect={e => e.preventDefault()}
                      >
                        All
                      </DropdownMenuCheckboxItem>
                      {months.map(month => (
                        <DropdownMenuCheckboxItem
                          key={month}
                          checked={selectedMonths.includes(month)}
                          onCheckedChange={checked => {
                            setSelectedMonths(checked
                              ? [...selectedMonths, month]
                              : selectedMonths.filter(m => m !== month)
                            );
                          }}
                          onSelect={e => e.preventDefault()}
                        >
                          {month}
                        </DropdownMenuCheckboxItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {/* Years Dropdown and Apply Filters Button */}
                <div className="min-w-[180px] flex items-end gap-2">
                  <div className="w-full">
                    <label className="block text-sm font-medium text-neutral-700 mb-2">Years</label>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="w-full justify-between">
                          {selectedYears.length === 0 ? 'Select Years' : selectedYears.length === yearOptions.length ? 'All' : `${selectedYears.length} selected`}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="max-h-72 overflow-y-auto w-full min-w-[180px]" onCloseAutoFocus={e => e.preventDefault()}>
                        <DropdownMenuCheckboxItem
                          checked={selectedYears.length === 0}
                          onCheckedChange={checked => {
                            setSelectedYears(checked ? yearOptions : []);
                          }}
                          onSelect={e => e.preventDefault()}
                        >
                          All
                        </DropdownMenuCheckboxItem>
                        {yearOptions.map(year => (
                          <DropdownMenuCheckboxItem
                            key={year}
                            checked={selectedYears.includes(year)}
                            onCheckedChange={checked => {
                              setSelectedYears(checked
                                ? [...selectedYears, year]
                                : selectedYears.filter(y => y !== year)
                              );
                            }}
                            onSelect={e => e.preventDefault()}
                          >
                            {year}
                          </DropdownMenuCheckboxItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <Button
                    className="h-10 ml-2"
                    variant="default"
                    onClick={() => setSelectedYears(selectedYears)}
                    disabled={selectedYears.length === 0}
                  >
                    Apply Filters
                  </Button>
                </div>
              </div>
              {/* Map Visualization */}
              <MapVisualization
                selectedYears={selectedYears}
                selectedMakers={selectedMakers}
                selectedRTOs={selectedRTOs}
                selectedMonths={selectedMonths}
                selectedStates={selectedStates}
                selectedDistricts={selectedDistricts}
                viewMode={viewMode}
                showLabels={showLabels}
              />
            </div>
          </div>

          {/* Data Table */}
          <DataTable
            selectedYears={selectedYears}
            selectedMakers={selectedMakers}
            selectedRTOs={selectedRTOs}
            selectedMonths={selectedMonths}
            selectedStates={effectiveSelectedStates}
            selectedDistricts={selectedDistricts}
          />
        </main>
      </div>
    </div>
  );
}
