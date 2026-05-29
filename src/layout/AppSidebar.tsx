"use client";
import React, { useEffect, useRef, useState,useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSidebar } from "../context/SidebarContext";
import {
  BoxCubeIcon,
  CalenderIcon,
  ChevronDownIcon,
  GridIcon,
  HorizontaLDots,
  ListIcon,
  PageIcon,
  PaperPlaneIcon,
  PieChartIcon,
  PlugInIcon,
  TableIcon,
  TaskIcon,
  UserCircleIcon,
} from "../icons/index";
import SidebarWidget from "./SidebarWidget";

type NavItem = {
  name: string;
  icon: React.ReactNode;
  path?: string;
  subItems?: { name: string; path: string; pro?: boolean; new?: boolean }[];
};

// ─── Merchant nav ─────────────────────────────────────────────────────────────

const merchantNavItems: NavItem[] = [
  {
    icon: <GridIcon />,
    name: "Dashboard",
    subItems: [{ name: "Ecommerce", path: "/", pro: false }],
  },
  {
    icon: <ListIcon />,
    name: "Products",
    subItems: [
      { name: "Create Product", path: "/products/v2/create", pro: false, new: true },
      { name: "My Products", path: "/products", pro: false, new: true },
      { name: "Channel Mapping Templates", path: "/products/channel-templates", pro: false, new: true },
    ],
  },
  {
    icon: <PlugInIcon />,
    name: "Channel Platform",
    subItems: [
      { name: "Channel Stores", path: "/channels/stores", pro: false, new: true },
      { name: "My Categories", path: "/channels/categories", pro: false, new: true },
      { name: "Channel Category Mapping", path: "/omni-admin/channel-category-mapping", pro: false, new: true },
      { name: "Channel Products", path: "/channels/products", pro: false },
      { name: "Sync Queue", path: "/channels/sync-queue", pro: false },
      { name: "Inventory Sync", path: "/channels/inventory", pro: false },
    ],
  },
  {
    icon: <UserCircleIcon />,
    name: "User Profile",
    path: "/profile",
  },
];

// ─── Admin nav ────────────────────────────────────────────────────────────────

const adminNavItems: NavItem[] = [
  {
    icon: <TableIcon />,
    name: "Catalog Setup",
    subItems: [
      { name: "Product Types", path: "/omni-admin/product-types", pro: false, new: true },
      { name: "Master Attributes", path: "/omni-admin/master-attributes", pro: false, new: true },
      { name: "Product Categories", path: "/omni-admin/product-categories", pro: false, new: true },
    ],
  },
  {
    icon: <PaperPlaneIcon />,
    name: "Platform Admin",
    subItems: [
      { name: "Category Templates", path: "/platform-admin/category-templates", pro: false, new: true },
    ],
  },
  {
    icon: <TaskIcon />,
    name: "Business Rules",
    path: "/business-rules",
  },
  {
    icon: <PageIcon />,
    name: "Conditional Logic",
    path: "/conditional-logic",
  },
];

// const othersItems: NavItem[] = [
  // {
  //   icon: <PieChartIcon />,
  //   name: "Charts",
  //   subItems: [
  //     { name: "Line Chart", path: "/line-chart", pro: false },
  //     { name: "Bar Chart", path: "/bar-chart", pro: false },
  //   ],
  // },
  // {
  //   icon: <PlugInIcon />,
  //   name: "Authentication",
  //   subItems: [
  //     { name: "Sign In", path: "/signin", pro: false },
  //     { name: "Sign Up", path: "/signup", pro: false },
  //   ],
  // },
// ];

const AppSidebar: React.FC = () => {
  const {
    isExpanded,
    isMobileOpen,
    isHovered,
    setIsHovered,
    toggleSidebar,
    toggleMobileSidebar,
  } = useSidebar();
  const pathname = usePathname();

   const renderMenuItems = (
    navItems: NavItem[],
    menuType: "merchant" | "admin"
  ) => (
    <ul className="flex flex-col gap-4">
      {navItems.map((nav, index) => (
        <li key={nav.name}>
          {nav.subItems ? (
            <button
              onClick={() => handleSubmenuToggle(index, menuType)}
              className={`menu-item group  ${
                openSubmenu?.type === menuType && openSubmenu?.index === index
                  ? "menu-item-active"
                  : "menu-item-inactive"
              } cursor-pointer ${
                !isExpanded && !isHovered
                  ? "lg:justify-center"
                  : "lg:justify-start"
              }`}
            >
              <span
                className={` ${
                  openSubmenu?.type === menuType && openSubmenu?.index === index
                    ? "menu-item-icon-active"
                    : "menu-item-icon-inactive"
                }`}
              >
                {nav.icon}
              </span>
              {(isExpanded || isHovered || isMobileOpen) && (
                <span className={`menu-item-text`}>{nav.name}</span>
              )}
              {(isExpanded || isHovered || isMobileOpen) && (
                <ChevronDownIcon
                  className={`ml-auto w-5 h-5 transition-transform duration-200  ${
                    openSubmenu?.type === menuType &&
                    openSubmenu?.index === index
                      ? "rotate-180 text-brand-500"
                      : ""
                  }`}
                />
              )}
            </button>
          ) : (
            nav.path && (
              <Link
                href={nav.path}
                onClick={handleNavLinkClick}
                className={`menu-item group ${
                  isActive(nav.path) ? "menu-item-active" : "menu-item-inactive"
                }`}
              >
                <span
                  className={`${
                    isActive(nav.path)
                      ? "menu-item-icon-active"
                      : "menu-item-icon-inactive"
                  }`}
                >
                  {nav.icon}
                </span>
                {(isExpanded || isHovered || isMobileOpen) && (
                  <span className={`menu-item-text`}>{nav.name}</span>
                )}
              </Link>
            )
          )}
          {nav.subItems && (isExpanded || isHovered || isMobileOpen) && (
            <div
              ref={(el) => {
                subMenuRefs.current[`${menuType}-${index}`] = el;
              }}
              className="overflow-hidden transition-all duration-300"
              style={{
                height:
                  openSubmenu?.type === menuType && openSubmenu?.index === index
                    ? `${subMenuHeight[`${menuType}-${index}`]}px`
                    : "0px",
              }}
            >
              <ul className="mt-2 space-y-1 ml-9">
                {nav.subItems.map((subItem) => (
                  <li key={subItem.name}>
                    <Link
                      href={subItem.path}
                      onClick={handleNavLinkClick}
                      className={`menu-dropdown-item ${
                        isActive(subItem.path)
                          ? "menu-dropdown-item-active"
                          : "menu-dropdown-item-inactive"
                      }`}
                    >
                      {subItem.name}
                      <span className="flex items-center gap-1 ml-auto">
                        {subItem.new && (
                          <span
                            className={`ml-auto ${
                              isActive(subItem.path)
                                ? "menu-dropdown-badge-active"
                                : "menu-dropdown-badge-inactive"
                            } menu-dropdown-badge `}
                          >
                            new
                          </span>
                        )}
                        {subItem.pro && (
                          <span
                            className={`ml-auto ${
                              isActive(subItem.path)
                                ? "menu-dropdown-badge-active"
                                : "menu-dropdown-badge-inactive"
                            } menu-dropdown-badge `}
                          >
                            pro
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </li>
      ))}
    </ul>
  );

  const [openSubmenu, setOpenSubmenu] = useState<{
    type: "merchant" | "admin";
    index: number;
  } | null>(null);
  const [subMenuHeight, setSubMenuHeight] = useState<Record<string, number>>(
    {}
  );
  const subMenuRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Bug 3 fix: debounce the hover-collapse so that clicking a menu item while
  // the sidebar is hover-expanded doesn't immediately shrink it.  Without this,
  // the natural mouse movement after a click fires onMouseLeave → setIsHovered(false)
  // before the navigation completes, making the sidebar snap to 90 px.
  const hoverLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleMouseEnter = useCallback(() => {
    if (hoverLeaveTimerRef.current) clearTimeout(hoverLeaveTimerRef.current);
    if (!isExpanded) setIsHovered(true);
  }, [isExpanded, setIsHovered]);

  const handleMouseLeave = useCallback(() => {
    hoverLeaveTimerRef.current = setTimeout(() => setIsHovered(false), 300);
  }, [setIsHovered]);

  /**
   * Called by every navigation Link inside the sidebar.
   *
   * Mobile  → close the drawer immediately so the user returns to the page.
   * Desktop (hover-expand mode, isExpanded=false) → pin the sidebar to fully
   *   expanded so it doesn't auto-collapse after the mouse drifts away post-click.
   * Desktop (already pinned, isExpanded=true) → nothing to do.
   */
  const handleNavLinkClick = useCallback(() => {
    if (isMobileOpen) {
      toggleMobileSidebar();
    } else if (!isExpanded && isHovered) {
      // Cancel the pending hover-leave timer so the width transition is clean
      if (hoverLeaveTimerRef.current) clearTimeout(hoverLeaveTimerRef.current);
      toggleSidebar();   // isExpanded → true
      setIsHovered(false);
    }
  }, [isMobileOpen, isExpanded, isHovered, toggleMobileSidebar, toggleSidebar, setIsHovered]);

  // const isActive = (path: string) => path === pathname;
   const isActive = useCallback((path: string) => path === pathname, [pathname]);

  useEffect(() => {
    // Open the correct submenu accordion when the pathname matches a sub-item.
    // We deliberately do NOT close the accordion when navigating to a direct-link
    // page (Business Rules, Profile, etc.) — that was causing the jarring
    // "accordion collapses on click" behaviour. The user can still manually
    // collapse any accordion by clicking its parent button.
    //
    // NOTE: previously this looped over ["main","others"] using the same navItems
    // array for both passes. The "others" pass would overwrite the "main" result
    // with type:"others", making every submenu appear closed on navigation.
    // Fixed: single pass, always type "main".
    merchantNavItems.forEach((nav, index) => {
      if (nav.subItems) {
        nav.subItems.forEach((subItem) => {
          if (isActive(subItem.path)) {
            setOpenSubmenu({ type: "merchant", index });
          }
        });
      }
    });
    adminNavItems.forEach((nav, index) => {
      if (nav.subItems) {
        nav.subItems.forEach((subItem) => {
          if (isActive(subItem.path)) {
            setOpenSubmenu({ type: "admin", index });
          }
        });
      }
    });
  }, [pathname, isActive]);

  useEffect(() => {
    // Recalculate submenu height whenever openSubmenu changes OR whenever the
    // sidebar transitions between collapsed / hover-expanded / fully-expanded.
    // The submenu <div> is conditionally rendered, so it may not exist in the
    // DOM when openSubmenu first changes (e.g. on initial load while collapsed).
    // The setTimeout(0) defers the read until after React has flushed the DOM.
    if (openSubmenu !== null) {
      const key = `${openSubmenu.type}-${openSubmenu.index}`;
      const timer = setTimeout(() => {
        if (subMenuRefs.current[key]) {
          setSubMenuHeight((prevHeights) => ({
            ...prevHeights,
            [key]: subMenuRefs.current[key]?.scrollHeight || 0,
          }));
        }
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [openSubmenu, isExpanded, isHovered, isMobileOpen]);

  const handleSubmenuToggle = (index: number, menuType: "merchant" | "admin") => {
    setOpenSubmenu((prevOpenSubmenu) => {
      if (
        prevOpenSubmenu &&
        prevOpenSubmenu.type === menuType &&
        prevOpenSubmenu.index === index
      ) {
        return null;
      }
      return { type: menuType, index };
    });
  };

  return (
    <aside
      className={`fixed mt-16 flex flex-col lg:mt-0 top-0 px-5 left-0 bg-white dark:bg-gray-900 dark:border-gray-800 text-gray-900 h-screen transition-all duration-300 ease-in-out z-50 border-r border-gray-200 
        ${
          isExpanded || isMobileOpen
            ? "w-[290px]"
            : isHovered
            ? "w-[290px]"
            : "w-[90px]"
        }
        ${isMobileOpen ? "translate-x-0" : "-translate-x-full"}
        lg:translate-x-0`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div
        className={`py-8 flex  ${
          !isExpanded && !isHovered ? "lg:justify-center" : "justify-start"
        }`}
      >
        <Link href="/">
          {isExpanded || isHovered || isMobileOpen ? (
            <>
              <Image
                className="dark:hidden"
                src="/images/logo/logo.svg"
                alt="Logo"
                width={150}
                height={40}
              />
              <Image
                className="hidden dark:block"
                src="/images/logo/logo-dark.svg"
                alt="Logo"
                width={150}
                height={40}
              />
            </>
          ) : (
            <Image
              src="/images/logo/logo-icon.svg"
              alt="Logo"
              width={32}
              height={32}
            />
          )}
        </Link>
      </div>
      <div className="flex flex-col overflow-y-auto duration-300 ease-linear no-scrollbar">
        <nav className="mb-6">
          <div className="flex flex-col gap-4">

            {/* ── Merchant section ── */}
            <div>
              <h2
                className={`mb-4 text-xs uppercase flex leading-[20px] text-gray-400 ${
                  !isExpanded && !isHovered ? "lg:justify-center" : "justify-start"
                }`}
              >
                {isExpanded || isHovered || isMobileOpen ? "My Store" : <HorizontaLDots />}
              </h2>
              {renderMenuItems(merchantNavItems, "merchant")}
            </div>

            {/* ── Divider ── */}
            {(isExpanded || isHovered || isMobileOpen) && (
              <div className="border-t border-gray-200 dark:border-gray-700/60 my-1" />
            )}

            {/* ── Admin section ── */}
            <div>
              <h2
                className={`mb-4 text-xs uppercase flex leading-[20px] text-gray-400 ${
                  !isExpanded && !isHovered ? "lg:justify-center" : "justify-start"
                }`}
              >
                {isExpanded || isHovered || isMobileOpen ? "Admin" : <HorizontaLDots />}
              </h2>
              {renderMenuItems(adminNavItems, "admin")}
            </div>

          </div>
        </nav>
        {/* {isExpanded || isHovered || isMobileOpen ? <SidebarWidget /> : null} */}
      </div>
    </aside>
  );
};

export default AppSidebar;
