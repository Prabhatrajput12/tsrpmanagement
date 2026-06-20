# Workshop Estimate & Production Calculator

A professional, visual web application designed for workshops to calculate raw material costs, production time, labor fees, and final sales pricing for customer orders.

## Features

- **Interactive Estimator**: Select a product template or add custom materials and steps. Enter desired quantities and see instantaneous calculations.
- **Detailed Time Estimations**: Breaks down production time into setup time and run time (per-unit), calculating total production hours and total calendar workdays (assuming an 8-hour workday).
- **Aesthetic Cost Analytics**: Real-time visualization of cost breakdowns (Materials vs. Labor vs. Profit Markup) via SVG donut charts.
- **Customizable Catalog**: Manage default materials, inventory costs, units, and custom workshop operations (e.g., CNC cutting, welding, assembly) with default hourly labor rates.
- **Saved Estimates Database**: Maintain a history of past quotes inside your browser's local storage.
- **Invoice Export & Print Style**: Generate a clean, structured print layout ready to save as a PDF invoice or quote for customers.

## Getting Started

Since this is a client-side Single-Page Application (SPA) built using pure HTML, CSS, and modern JavaScript, no server setup or installations are required!

### Running the App
1. Open the project folder `TSRPS`.
2. Double-click `index.html` to open the application in any modern web browser (Chrome, Safari, Firefox, Edge).
3. Alternatively, you can use a local static server like `npx serve` or Live Server to run it locally.

## Calculation Logic

The software calculates estimates based on the following formulas:

### 1. Material Costs

- **If Component Weight or Runner Weight is specified:**
  $$\text{Material Cost} = \sum \left( \text{Qty Per Product} \times (\text{Component Wt} + 0.75 \times \text{Runner Wt}) \times \text{Conversion Factor} \times \text{Unit Cost} \right) \times \text{Product Quantity}$$
  *(where \(\text{Conversion Factor}\) converts the Weight Unit to the material purchase unit)*

- **Otherwise (Standard Quantity-based):**
  $$\text{Material Cost} = \sum \left( \text{Qty Per Product} \times \text{Unit Cost} \right) \times \text{Product Quantity}$$

### 2. Time & Labor Costs
- **Production Time (per step)**:
  $$\text{Step Time} = \text{Setup Time (min)} + \left( \text{Run Time Per Unit (min)} \times \text{Product Quantity} \right)$$
- **Total Production Time**:
  $$\text{Total Time (hours)} = \frac{\sum \text{Step Time}}{60}$$
- **Total Work Days**:
  $$\text{Work Days} = \frac{\text{Total Time (hours)}}{\text{Workday Hours (e.g., 8 hours)}}$$
- **Labor Costs**:
  $$\text{Labor Cost} = \sum \left( \frac{\text{Step Time}}{60} \times \text{Hourly Rate} \right)$$

### 3. Total Prices
- **Base Cost**:
  $$\text{Base Cost} = \text{Total Material Cost} + \text{Total Labor Cost}$$
- **Final Price (with Markup)**:
  $$\text{Final Price} = \text{Base Cost} \times (1 + \frac{\text{Markup \%}}{100})$$
- **Total Profit**:
  $$\text{Total Profit} = \text{Final Price} - \text{Base Cost}$$
